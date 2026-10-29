import type { AuditRecord } from "./audit/store.js";
import {
  evaluate,
  evaluateArgsPhase,
  evaluateResultPhase,
  type Decision,
  type PolicyConfig,
} from "./policy/engine.js";

export interface SimChange {
  server: string;
  tool: string;
  from: string; // policy verdict behind the recorded decision ("allow" | "deny" | "approve")
  to: string; // decision the proposed policy would produce ("allow" | "deny" | "approve")
  reason: string;
  ruleIndex: number | null;
}

export interface SimResult {
  total: number;
  unchanged: number;
  nowDenied: number; // verdict is now deny
  nowAllowed: number; // verdict is now allow
  nowPrompt: number; // would now require human approval
  skipped: number; // never reached policy (unknown tool / internal error)
  approximate: number; // compared rows with redacted args under a policy that matches on args
  changes: SimChange[];
}

/**
 * The policy's verdict behind a recorded row. `decision` is the final outcome
 * (after rate limits and human clicks); legacy rows lack `policyDecision`, so infer it.
 */
export function historicalPolicyDecision(r: AuditRecord): "allow" | "deny" | "approve" | null {
  if (r.policyDecision !== null) return r.policyDecision as "allow" | "deny" | "approve";
  const reason = r.reason ?? "";
  if (reason.startsWith("unknown tool") || reason.startsWith("internal error")) return null;
  if (["approved by user", "denied by user", "user did not approve"].includes(reason)) return "approve";
  if (reason.startsWith("flagged result not approved")) return "approve";
  if (reason === "rate limit exceeded") return "allow";
  if (r.decision === "allow" && r.approvalActor !== null) return "approve";
  return r.decision as "allow" | "deny";
}

function parseArgs(argsJson: string): Record<string, unknown> {
  try {
    const v = JSON.parse(argsJson) as unknown;
    return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Re-decide a single historical call under a proposed policy, mirroring the
 * gateway's policy pipeline (base evaluate -> args-phase secret escalation ->
 * result-phase injection escalation). Rate limits and human approvals are not
 * replayed — an escalation to `approve` is reported as its own outcome.
 */
function redecide(cfg: PolicyConfig, r: AuditRecord): Decision {
  const args = parseArgs(r.argsJson);
  const argFlags = r.flags.filter((f) => f.startsWith("secret:") || f.startsWith("path:"));
  const resultFlags = r.flags.filter((f) => f.startsWith("injection:"));
  const input = { server: r.server, tool: r.tool, args, flags: argFlags };

  let dec = evaluate(cfg, input);
  if (argFlags.length > 0) {
    const argsDec = evaluateArgsPhase(cfg, input);
    if (argsDec && argsDec.action === "deny") dec = argsDec; // escalate, never downgrade
  }
  if (dec.action !== "deny" && resultFlags.length > 0) {
    const rdec = evaluateResultPhase(cfg, { ...input, flags: resultFlags });
    if (rdec.action === "deny" || rdec.action === "approve") dec = rdec;
  }
  return dec;
}

export function simulate(cfg: PolicyConfig, records: AuditRecord[]): SimResult {
  const result: SimResult = {
    total: records.length,
    unchanged: 0,
    nowDenied: 0,
    nowAllowed: 0,
    nowPrompt: 0,
    skipped: 0,
    approximate: 0,
    changes: [],
  };
  const hasArgsRule = cfg.policies.some((p) => p.match.args !== undefined);

  for (const r of records) {
    const from = historicalPolicyDecision(r);
    if (from === null) {
      result.skipped++;
      continue;
    }
    if (hasArgsRule && r.argsJson.includes("[REDACTED:")) result.approximate++;
    const dec = redecide(cfg, r);
    const to = dec.action;

    if (to === from) {
      result.unchanged++;
      continue;
    }

    if (to === "approve") result.nowPrompt++;
    else if (to === "deny") result.nowDenied++;
    else if (to === "allow") result.nowAllowed++;

    result.changes.push({
      server: r.server,
      tool: r.tool,
      from,
      to,
      reason: dec.reason,
      ruleIndex: dec.ruleIndex,
    });
  }

  return result;
}

export function formatSimulation(r: SimResult): string {
  const lines: string[] = [];
  const plural = (n: number) => (n === 1 ? "call" : "calls");
  lines.push(`Replayed ${r.total} ${plural(r.total)} from the audit log against the proposed policy.`);
  lines.push("");
  lines.push(`  unchanged:         ${r.unchanged}`);
  lines.push(`  now DENIED:        ${r.nowDenied}   (were allowed or asked before)`);
  lines.push(`  now ALLOWED:       ${r.nowAllowed}   (were denied or asked before)`);
  lines.push(`  now need APPROVAL: ${r.nowPrompt}   (were allowed or denied before)`);
  if (r.skipped > 0) {
    lines.push(`  skipped:           ${r.skipped}   (never reached policy: unknown tool / internal error)`);
  }
  if (r.approximate > 0) {
    lines.push("");
    lines.push(`Note: ${r.approximate} replayed ${plural(r.approximate)} had redacted arguments; rules matching on args may be approximate.`);
  }

  if (r.changes.length > 0) {
    lines.push("");
    lines.push("Changed decisions:");
    for (const c of r.changes) {
      const rule = c.ruleIndex === null ? "" : ` [rule #${c.ruleIndex}]`;
      lines.push(`  ${c.from} -> ${c.to.toUpperCase()}  ${c.server}/${c.tool}  — ${c.reason}${rule}`);
    }
  } else {
    lines.push("");
    lines.push("No decisions would change. Safe to apply.");
  }
  return lines.join("\n");
}
