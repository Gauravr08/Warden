import type { Action, Match, PolicyRule } from "../config/schema.js";
import { argsMatch, globMatch } from "./matcher.js";

export interface PolicyInput {
  server: string;
  tool: string;
  args: Record<string, unknown>;
  flags: string[];
}

export interface Decision {
  action: Action;
  ruleIndex: number | null;
  reason: string;
}

export interface PolicyConfig {
  policies: PolicyRule[];
  defaults: { action: Action };
}

function ruleMatches(m: Match, input: PolicyInput): boolean {
  if (m.server !== undefined && !globMatch(m.server, input.server)) return false;
  if (m.tool !== undefined && !globMatch(m.tool, input.tool)) return false;
  if (m.args !== undefined && !argsMatch(m.args, input.args)) return false;
  if (m.args_contain_secret !== undefined) {
    const has = input.flags.some((f) => f.startsWith("secret:") || f.startsWith("path:"));
    if (has !== m.args_contain_secret) return false;
  }
  if (m.result_has_injection !== undefined) {
    const has = input.flags.some((f) => f.startsWith("injection:"));
    if (has !== m.result_has_injection) return false;
  }
  return true;
}

export function evaluate(cfg: PolicyConfig, input: PolicyInput): Decision {
  for (let i = 0; i < cfg.policies.length; i++) {
    if (ruleMatches(cfg.policies[i].match, input)) {
      return { action: cfg.policies[i].action, ruleIndex: i, reason: `matched policy #${i}` };
    }
  }
  return { action: cfg.defaults.action, ruleIndex: null, reason: "default action" };
}

export function evaluateResultPhase(cfg: PolicyConfig, input: PolicyInput): Decision {
  for (let i = 0; i < cfg.policies.length; i++) {
    const rule = cfg.policies[i];
    if (rule.match.result_has_injection === undefined) continue;
    if (ruleMatches(rule.match, input)) {
      return { action: rule.action, ruleIndex: i, reason: `matched policy #${i} (result phase)` };
    }
  }
  return { action: "approve", ruleIndex: null, reason: "default: injection flags escalate to approval" };
}
