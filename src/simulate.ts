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
  from: string; // decision recorded in the audit log ("allow" | "deny")
  to: string; // decision the proposed policy would produce ("allow" | "deny" | "approve")
  reason: string;
  ruleIndex: number | null;
}

export interface SimResult {
  total: number;
  unchanged: number;
  nowDenied: number; // was allow -> now deny
  nowAllowed: number; // was deny -> now allow
  nowPrompt: number; // would now require human approval
  changes: SimChange[];
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
    changes: [],
  };

  for (const r of records) {
    const dec = redecide(cfg, r);
    const to = dec.action;
    const from = r.decision;

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
  lines.push(`  now DENIED:        ${r.nowDenied}   (were allowed before)`);
  lines.push(`  now ALLOWED:       ${r.nowAllowed}   (were denied before)`);
  lines.push(`  now need APPROVAL: ${r.nowPrompt}`);

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
