import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { WardenConfig } from "./config/schema.js";
import { expandHome } from "./config/load.js";
import { evaluate, evaluateArgsPhase, evaluateResultPhase, type Decision } from "./policy/engine.js";
import { globMatch } from "./policy/matcher.js";
import { appendPolicyRule } from "./policy/writer.js";
import { scanArgs, scanResult } from "./scanner/index.js";
import type { AuditStore } from "./audit/store.js";
import type { ApprovalManager } from "./approval/manager.js";
import type { ToolRegistry } from "./registry.js";

export interface GatewayDownstream {
  serverNames(): string[];
  state(name: string): string;
  listTools(name: string): Promise<Tool[]>;
  callTool(name: string, tool: string, args: Record<string, unknown>): Promise<CallToolResult>;
  on(event: "toolsChanged", fn: (server: string) => void): unknown;
}

export interface GatewayDeps {
  config: WardenConfig;
  configPath: string;
  downstream: GatewayDownstream;
  registry: ToolRegistry;
  approvals: ApprovalManager;
  audit: AuditStore;
}

function errResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function byteSize(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v) ?? "");
}

interface RecordInput {
  server: string; tool: string; args: Record<string, unknown>;
  decision: string; ruleIndex: number | null; reason: string | null;
  policyDecision: string | null; flags: string[]; forwarded: boolean; approvalActor: string | null; approvalMs: number | null;
  startTs: number; resultBytes: number | null; error: string | null;
}

export class Gateway {
  readonly server: Server;

  constructor(private deps: GatewayDeps) {
    this.server = new Server(
      { name: "warden", version: "0.1.0" },
      { capabilities: { tools: { listChanged: true } } },
    );
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.deps.registry.list(),
    }));
    this.server.setRequestHandler(CallToolRequestSchema, async (req) =>
      this.callTool(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>),
    );
    deps.downstream.on("toolsChanged", () => {
      void this.refreshTools(true);
    });
  }

  async refreshTools(notify = false): Promise<void> {
    const byServer = new Map<string, Tool[]>();
    for (const name of this.deps.downstream.serverNames()) {
      if (this.deps.downstream.state(name) !== "running") continue;
      try {
        byServer.set(name, await this.deps.downstream.listTools(name));
      } catch {
        byServer.set(name, []);
      }
    }
    this.deps.registry.refresh(byServer);
    if (notify) {
      try {
        await this.server.sendToolListChanged();
      } catch {
        // not connected yet — fine
      }
    }
  }

  async callTool(exposedName: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const startTs = Date.now();
    const reached: { server: string; forwarded: boolean } = { server: "unknown", forwarded: false };
    try {
      return await this.pipeline(exposedName, args, startTs, reached);
    } catch (e) {
      const msg = (e as Error).message;
      this.record({
        server: reached.server, tool: exposedName, args, decision: "deny", ruleIndex: null,
        reason: `internal error (${msg})`, policyDecision: null, flags: [], forwarded: reached.forwarded,
        approvalActor: null, approvalMs: null, startTs, resultBytes: null, error: msg,
      });
      return errResult(`Blocked by warden: internal error (${msg})`);
    }
  }

  private async pipeline(
    exposedName: string,
    args: Record<string, unknown>,
    startTs: number,
    reached: { server: string; forwarded: boolean },
  ): Promise<CallToolResult> {
    const route = this.deps.registry.resolve(exposedName);
    if (!route) {
      this.record({
        server: "unknown", tool: exposedName, args, decision: "deny", ruleIndex: null,
        reason: `unknown tool ${exposedName}`, policyDecision: null, flags: [], forwarded: false,
        approvalActor: null, approvalMs: null, startTs, resultBytes: null, error: null,
      });
      return errResult(`Blocked by warden: unknown tool ${exposedName}`);
    }
    reached.server = route.server;

    const allowedRoots = this.deps.config.scanner.allowed_roots?.map(expandHome);
    const argFlags = scanArgs(args, { allowedRoots });
    let decision: Decision = evaluate(this.deps.config, {
      server: route.server, tool: route.tool, args, flags: argFlags,
    });
    if (argFlags.some((f) => f.startsWith("secret:") || f.startsWith("path:"))) {
      const argsDec = evaluateArgsPhase(this.deps.config, {
        server: route.server, tool: route.tool, args, flags: argFlags,
      });
      if (argsDec && argsDec.action === "deny") {
        decision = argsDec; // secret/path deny escalates over an earlier allow; never downgrades a deny
      }
    }
    let policyDecision: string = decision.action; // verdict before rate limit / human input
    let approvalActor: string | null = null;
    let approvalMs: number | null = null;

    if (decision.action === "allow" && this.overLimit(route.server, route.tool)) {
      decision = { action: "deny", ruleIndex: null, reason: "rate limit exceeded" };
    }

    if (decision.action === "approve") {
      const outcome = await this.deps.approvals.request({
        server: route.server, tool: route.tool, args, flags: argFlags, phase: "call",
      });
      approvalActor = outcome.actor;
      approvalMs = outcome.waitedMs;
      if (outcome.always) this.persistAlways(route.server, route.tool, outcome.always);
      decision = outcome.approved
        ? { action: "allow", ruleIndex: decision.ruleIndex, reason: "approved by user" }
        : {
            action: "deny", ruleIndex: decision.ruleIndex,
            reason: outcome.actor === "timeout" ? "user did not approve" : "denied by user",
          };
    }

    if (decision.action === "deny") {
      this.record({
        server: route.server, tool: route.tool, args, decision: "deny",
        ruleIndex: decision.ruleIndex, reason: decision.reason, policyDecision, flags: argFlags, forwarded: false,
        approvalActor, approvalMs, startTs, resultBytes: null, error: null,
      });
      return errResult(`Blocked by warden: ${decision.reason}`);
    }

    let result: CallToolResult;
    try {
      result = await this.deps.downstream.callTool(route.server, route.tool, args);
      reached.forwarded = true;
    } catch (e) {
      this.record({
        server: route.server, tool: route.tool, args, decision: "allow",
        ruleIndex: decision.ruleIndex, reason: decision.reason, policyDecision, flags: argFlags, forwarded: true,
        approvalActor, approvalMs, startTs, resultBytes: null, error: (e as Error).message,
      });
      return errResult(`Tool call failed: ${(e as Error).message}`);
    }

    const resultFlags = scanResult(result);
    const allFlags = [...argFlags, ...resultFlags];
    if (resultFlags.length > 0) {
      const rdec = evaluateResultPhase(this.deps.config, {
        server: route.server, tool: route.tool, args, flags: resultFlags,
      });
      if (rdec.action === "deny" || rdec.action === "approve") policyDecision = rdec.action;
      let blockedReason: string | null = null;
      if (rdec.action === "deny") {
        blockedReason = `result flagged (${resultFlags.join(", ")})`;
      } else if (rdec.action === "approve") {
        const outcome = await this.deps.approvals.request({
          server: route.server, tool: route.tool, args, flags: resultFlags, phase: "result",
        });
        approvalActor = outcome.actor;
        approvalMs = (approvalMs ?? 0) + outcome.waitedMs;
        if (outcome.always) this.persistAlways(route.server, route.tool, outcome.always);
        if (!outcome.approved) blockedReason = `flagged result not approved (${resultFlags.join(", ")})`;
      }
      if (blockedReason !== null) {
        this.record({
          server: route.server, tool: route.tool, args, decision: "deny",
          ruleIndex: rdec.ruleIndex, reason: blockedReason, policyDecision, flags: allFlags, forwarded: true,
          approvalActor, approvalMs, startTs, resultBytes: byteSize(result), error: null,
        });
        return errResult(`Blocked by warden: ${blockedReason}`);
      }
    }

    this.record({
      server: route.server, tool: route.tool, args, decision: "allow",
      ruleIndex: decision.ruleIndex, reason: decision.reason, policyDecision, flags: allFlags, forwarded: true,
      approvalActor, approvalMs, startTs, resultBytes: byteSize(result), error: null,
    });
    return result;
  }

  private persistAlways(server: string, tool: string, always: "allow" | "deny"): void {
    const rule = { match: { server, tool }, action: always } as const;
    try {
      appendPolicyRule(this.deps.configPath, rule);
    } catch (e) {
      console.error(`[warden] failed to persist always-rule: ${(e as Error).message}`);
    }
    this.deps.config.policies.push(rule);
  }

  private overLimit(server: string, tool: string): boolean {
    const since = Date.now() - 3_600_000;
    for (const lim of this.deps.config.limits) {
      if (lim.match.server && !globMatch(lim.match.server, server)) continue;
      if (lim.match.tool && !globMatch(lim.match.tool, tool)) continue;
      let n: number;
      if (!lim.match.tool) {
        n = this.deps.audit.countForwardedSince(server, null, since);
      } else if (/[*?[\]{}!]/.test(lim.match.tool)) {
        // glob pattern: count all forwarded tools on this server matching the pattern,
        // not just the exact tool being called — otherwise each distinct tool matched
        // by the glob gets its own independent counter and the aggregate cap is unbounded.
        const pattern = lim.match.tool;
        n = this.deps.audit.forwardedToolsSince(server, since).filter((t) => globMatch(pattern, t)).length;
      } else {
        n = this.deps.audit.countForwardedSince(server, lim.match.tool, since);
      }
      if (n >= lim.max_calls_per_hour) return true;
    }
    return false;
  }

  private record(r: RecordInput): void {
    try {
      this.deps.audit.insert({
        id: randomUUID(), ts: r.startTs, server: r.server, tool: r.tool,
        argsJson: JSON.stringify(r.args), decision: r.decision, ruleIndex: r.ruleIndex,
        reason: r.reason, policyDecision: r.policyDecision, flags: r.flags, forwarded: r.forwarded, approvalActor: r.approvalActor,
        approvalMs: r.approvalMs, resultBytes: r.resultBytes,
        durationMs: Date.now() - r.startTs, error: r.error,
      });
    } catch (e) {
      console.error(`[warden] audit write failed: ${(e as Error).message}`);
    }
  }
}
