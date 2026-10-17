import { mkdirSync, rmSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { loadConfig } from "../config/load.js";
import type { WardenConfig } from "../config/schema.js";
import { AuditStore } from "../audit/store.js";
import { ApprovalManager } from "../approval/manager.js";
import { DownstreamManager } from "../downstream/manager.js";
import { ToolRegistry } from "../registry.js";
import { Gateway } from "../gateway.js";
import { startDashboard, type DashboardHandle } from "../dashboard/server.js";
import { notifyPending } from "../notify.js";

export interface RunningGateway {
  dashboardPort: number;
  close(): Promise<void>;
}

export function stateFilePath(): string {
  return process.env.WARDEN_STATE_FILE ?? path.join(homedir(), ".warden", "state.json");
}

export function watchPolicies(
  configPath: string,
  live: WardenConfig,
  onWarning: (msg: string) => void,
): () => void {
  let timer: NodeJS.Timeout | null = null;
  const watcher = watch(configPath, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const next = loadConfig(configPath);
        live.policies = next.policies;
        live.limits = next.limits;
        live.defaults = next.defaults;
        live.scanner = next.scanner;
        console.error("[warden] policies reloaded");
      } catch (e) {
        const msg = `config reload failed, keeping last-good policies: ${(e as Error).message}`;
        console.error(`[warden] ${msg}`);
        onWarning(msg);
      }
    }, 200);
  });
  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}

export async function startGateway(
  configPath: string,
  frontendTransport?: Transport,
  onFrontendClose?: () => void,
): Promise<RunningGateway> {
  const config = loadConfig(configPath);

  const audit = new AuditStore(config.audit.db_path);
  const retentionMs = config.audit.retention_days * 86_400_000;
  const approvals = new ApprovalManager(config.approval_timeout_ms);
  const downstream = new DownstreamManager(config.servers);
  let purgeTimer: NodeJS.Timeout | undefined;
  let dash: DashboardHandle | undefined;
  let stopWatch: (() => void) | undefined;

  try {
    audit.purgeOlderThan(Date.now() - retentionMs);
    purgeTimer = setInterval(() => audit.purgeOlderThan(Date.now() - retentionMs), 3_600_000);
    purgeTimer.unref();

    approvals.on("pending", notifyPending);

    await downstream.start();

    const registry = new ToolRegistry();
    const gateway = new Gateway({ config, configPath, downstream, registry, approvals, audit });
    await gateway.refreshTools();

    dash = await startDashboard({ approvals, audit, configPath, registry }, config.dashboard.port);
    console.error(`[warden] dashboard: http://127.0.0.1:${dash.port}`);

    stopWatch = watchPolicies(configPath, config, (msg) =>
      dash!.broadcast("warning", { message: msg }),
    );

    const transport = frontendTransport ?? new StdioServerTransport();
    await gateway.server.connect(transport);
    console.error(`[warden] gateway ready (${Object.keys(config.servers).length} downstream servers)`);

    try {
      mkdirSync(path.dirname(stateFilePath()), { recursive: true });
      writeFileSync(
        stateFilePath(),
        JSON.stringify({ pid: process.pid, dashboardPort: dash.port, startedTs: Date.now() }),
      );
    } catch (e) {
      console.error(`[warden] could not write state file: ${(e as Error).message}`);
    }

    let closed = false;
    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      clearInterval(purgeTimer);
      stopWatch!();
      rmSync(stateFilePath(), { force: true });
      await gateway.server.close().catch(() => {});
      await dash!.close();
      await downstream.stop();
      audit.close();
    };

    // When the agent (our stdio parent, or an injected transport) disconnects,
    // tear everything down so we don't orphan child processes / hold the port.
    transport.onclose = () => {
      void close().then(() => onFrontendClose?.());
    };

    return { dashboardPort: dash.port, close };
  } catch (e) {
    if (purgeTimer) clearInterval(purgeTimer);
    stopWatch?.();
    await dash?.close().catch(() => {});
    await downstream.stop().catch(() => {});
    audit.close();
    throw e;
  }
}
