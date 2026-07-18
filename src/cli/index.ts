#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { loadConfig } from "../config/load.js";
import { AuditStore } from "../audit/store.js";
import { startGateway, stateFilePath } from "./start.js";
import { runImport, type ClientKind } from "./import.js";

const program = new Command();
program.name("warden").description("Security gateway for MCP tool calls").version("0.1.0");

program
  .command("start")
  .description("Start the gateway (stdio MCP server + localhost dashboard)")
  .option("--config <path>", "path to warden.yaml", "warden.yaml")
  .action(async (opts: { config: string }) => {
    try {
      const running = await startGateway(path.resolve(opts.config));
      let closing = false;
      const shutdown = async () => {
        if (closing) return;
        closing = true;
        await running.close();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } catch (e) {
      console.error(`[warden] ${(e as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show whether a gateway is running")
  .action(async () => {
    try {
      const state = JSON.parse(readFileSync(stateFilePath(), "utf8")) as { dashboardPort: number };
      const res = await fetch(`http://127.0.0.1:${state.dashboardPort}/api/health`);
      const health = (await res.json()) as { pid: number };
      console.error(`running: pid ${health.pid}, dashboard http://127.0.0.1:${state.dashboardPort}`);
    } catch {
      console.error("not running");
      process.exitCode = 1;
    }
  });

program
  .command("export")
  .description("Export the audit log as JSONL to stdout")
  .option("--config <path>", "path to warden.yaml", "warden.yaml")
  .action((opts: { config: string }) => {
    const config = loadConfig(path.resolve(opts.config));
    const audit = new AuditStore(config.audit.db_path);
    for (const rec of audit.query({ limit: 1_000_000 })) {
      process.stdout.write(JSON.stringify(rec) + "\n");
    }
    audit.close();
  });

program
  .command("import")
  .description("Generate warden.yaml from a client's MCP config")
  .requiredOption("--client <kind>", "claude-desktop | claude-code | cursor")
  .option("--file <path>", "explicit client config path (overrides --client default)")
  .option("--out <path>", "output warden.yaml path", "warden.yaml")
  .option("--apply", "swap the client config to point at warden (timestamped backup)", false)
  .action((opts: { client: ClientKind; file?: string; out: string; apply: boolean }) => runImport(opts));

await program.parseAsync(process.argv);
