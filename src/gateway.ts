import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { PolicyRule, WardenConfig } from "./config/schema.js";
import { expandHome } from "./config/load.js";
import { evaluate, evaluateResultPhase, type Decision, type PolicyInput } from "./policy/engine.js";
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

// evaluate() is plain first-match-wins: a broad, unconditional "allow" rule listed
// before a later args_contain_secret rule shadows it, letting a secret slip through.
// evaluateResultPhase() already solves this exact shadowing problem for the result
// phase by scoping its scan to only rules that declare result_has_injection; this
// mirrors that same pattern for the args/secret phase, without modifying the shared
// (already tested/frozen) policy engine.
function secretRuleOverride(policies: PolicyRule[], input: PolicyInput): Decision | null {
  const filtered: PolicyRule[] = [];
  const origIndex: number[] = [];
  policies.forEach((rule, i) => {
    if (rule.match.args_contain_secret !== undefined) {
      filtered.push(rule);
      origIndex.push(i);
    }
  });
  if (filtered.length === 0) return null;
  const d = evaluate({ policies: filtered, defaults: { action: "allow" } }, input);
  if (d.ruleIndex === null) return null;
  return { action: d.action, ruleIndex: origIndex[d.ruleIndex], reason: d.reason };
}

interface RecordInput {
  server: string; tool: string; args: Record<string, unknown>;
  decision: string; ruleIndex: number | null; flags: string[];
  forwarded: boolean; approvalActor: string | null; approvalMs: number | null;
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
    try {
      return await this.pipeline(exposedName, args, startTs);
    } catch (e) {
      const msg = (e as Error).message;
      this.record({
        server: "unknown", tool: exposedName, args, decision: "deny", ruleIndex: null,
        flags: [], forwarded: false, approvalActor: null, approvalMs: null,
        startTs, resultBytes: null, error: msg,
      });
      return errResult(`Blocked by warden: internal error (${msg})`);
    }
  }

  private async pipeline(
    exposedName: string,
    args: Record<string, unknown>,
    startTs: number,
  ): Promise<CallToolResult> {
    const route = this.deps.registry.resolve(exposedName);
    if (!route) {
      this.record({
        server: "unknown", tool: exposedName, args, decision: "deny", ruleIndex: null,
        flags: [], forwarded: false, approvalActor: null, approvalMs: null,
        startTs, resultBytes: null, error: null,
      });
      return errResult(`Blocked by warden: unknown tool ${exposedName}`);
    }

    const allowedRoots = this.deps.config.scanner.allowed_roots?.map(expandHome);
    const argFlags = scanArgs(args, { allowedRoots });
    let decision: Decision = evaluate(this.deps.config, {
      server: route.server, tool: route.tool, args, flags: argFlags,
    });
    const secretDecision = secretRuleOverride(this.deps.config.policies, {
      server: route.server, tool: route.tool, args, flags: argFlags,
    });
    if (secretDecision) decision = secretDecision;
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
        ruleIndex: decision.ruleIndex, flags: argFlags, forwarded: false,
        approvalActor, approvalMs, startTs, resultBytes: null, error: null,
      });
      return errResult(`Blocked by warden: ${decision.reason}`);
    }

    let result: CallToolResult;
    try {
      result = await this.deps.downstream.callTool(route.server, route.tool, args);
    } catch (e) {
      this.record({
        server: route.server, tool: route.tool, args, decision: "allow",
        ruleIndex: decision.ruleIndex, flags: argFlags, forwarded: true,
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
      let blockedReason: string | null = null;
      if (rdec.action === "deny") {
        blockedReason = `result flagged (${resultFlags.join(", ")})`;
      } else if (rdec.action === "approve") {
        const outcome = await this.deps.approvals.request({
          server: route.server, tool: route.tool, args, flags: resultFlags, phase: "result",
        });
        approvalActor = outcome.actor;
        approvalMs = (approvalMs ?? 0) + outcome.waitedMs;
        if (!outcome.approved) blockedReason = `flagged result not approved (${resultFlags.join(", ")})`;
      }
      if (blockedReason !== null) {
        this.record({
          server: route.server, tool: route.tool, args, decision: "deny",
          ruleIndex: rdec.ruleIndex, flags: allFlags, forwarded: true,
          approvalActor, approvalMs, startTs, resultBytes: byteSize(result), error: null,
        });
        return errResult(`Blocked by warden: ${blockedReason}`);
      }
    }

    this.record({
      server: route.server, tool: route.tool, args, decision: "allow",
      ruleIndex: decision.ruleIndex, flags: allFlags, forwarded: true,
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
    for (const lim of this.deps.config.limits) {
      if (lim.match.server && !globMatch(lim.match.server, server)) continue;
      if (lim.match.tool && !globMatch(lim.match.tool, tool)) continue;
      const n = this.deps.audit.countForwardedSince(
        server, lim.match.tool ? tool : null, Date.now() - 3_600_000,
      );
      if (n >= lim.max_calls_per_hour) return true;
    }
    return false;
  }

  private record(r: RecordInput): void {
    try {
      this.deps.audit.insert({
        id: randomUUID(), ts: r.startTs, server: r.server, tool: r.tool,
        argsJson: JSON.stringify(r.args), decision: r.decision, ruleIndex: r.ruleIndex,
        flags: r.flags, forwarded: r.forwarded, approvalActor: r.approvalActor,
        approvalMs: r.approvalMs, resultBytes: r.resultBytes,
        durationMs: Date.now() - r.startTs, error: r.error,
      });
    } catch (e) {
      console.error(`[warden] audit write failed: ${(e as Error).message}`);
    }
  }
}
