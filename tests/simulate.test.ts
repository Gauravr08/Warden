import { describe, it, expect } from "vitest";
import { simulate, formatSimulation, historicalPolicyDecision } from "../src/simulate.js";
import type { AuditRecord } from "../src/audit/store.js";
import type { PolicyRule, Action } from "../src/config/schema.js";

const rec = (over: Partial<AuditRecord>): AuditRecord => ({
  id: crypto.randomUUID(), ts: Date.now(), server: "fs", tool: "read_file",
  argsJson: "{}", decision: "allow", ruleIndex: 0, reason: null, flags: [], forwarded: true,
  policyDecision: null, approvalActor: null, approvalMs: null, resultBytes: 1, durationMs: 1, error: null,
  ...over,
});

const cfg = (policies: PolicyRule[], action: Action = "deny") => ({ policies, defaults: { action } });

describe("simulate", () => {
  it("counts unchanged when the proposed policy agrees with history", () => {
    const proposed = cfg([{ match: { server: "fs", tool: "read_file" }, action: "allow" }]);
    const r = simulate(proposed, [rec({ decision: "allow" }), rec({ decision: "allow" })]);
    expect(r.total).toBe(2);
    expect(r.unchanged).toBe(2);
    expect(r.changes).toHaveLength(0);
  });

  it("flags calls that would now be DENIED and names the new rule", () => {
    // history allowed read_file; proposed policy removes the allow -> default deny
    const proposed = cfg([{ match: { server: "fs", tool: "write_file" }, action: "allow" }], "deny");
    const r = simulate(proposed, [rec({ decision: "allow", tool: "read_file" })]);
    expect(r.nowDenied).toBe(1);
    expect(r.nowAllowed).toBe(0);
    expect(r.changes[0]).toMatchObject({ tool: "read_file", from: "allow", to: "deny" });
    expect(r.changes[0].reason).toMatch(/default/i); // fell through to defaults
  });

  it("flags calls that would now be ALLOWED", () => {
    const proposed = cfg([{ match: { server: "fs", tool: "danger" }, action: "allow" }], "deny");
    const r = simulate(proposed, [rec({ decision: "deny", tool: "danger", forwarded: false })]);
    expect(r.nowAllowed).toBe(1);
    expect(r.changes[0]).toMatchObject({ tool: "danger", from: "deny", to: "allow", ruleIndex: 0 });
  });

  it("flags calls that would now REQUIRE APPROVAL", () => {
    const proposed = cfg([], "approve"); // everything falls to default approve
    const r = simulate(proposed, [rec({ decision: "allow", tool: "read_file" })]);
    expect(r.nowPrompt).toBe(1);
    expect(r.changes[0].to).toBe("approve");
  });

  it("replays secret escalation: a path/secret flag deny wins over an allow", () => {
    // history: write to allowed path, no flags, allowed. proposed adds a secret-deny rule
    // and the recorded call carried a secret flag -> would now be denied via args phase.
    const proposed = cfg([
      { match: { server: "fs", tool: "write_file" }, action: "allow" },
      { match: { tool: "*", args_contain_secret: true }, action: "deny" },
    ], "deny");
    const withSecret = rec({ decision: "allow", tool: "write_file", flags: ["secret:aws-access-key"] });
    const r = simulate(proposed, [withSecret]);
    expect(r.nowDenied).toBe(1);
    expect(r.changes[0].reason).toMatch(/args phase/);
  });

  it("replays result-phase injection escalation", () => {
    // recorded a forwarded call whose result carried an injection flag; proposed policy
    // denies injected results -> would now be blocked.
    const proposed = cfg([
      { match: { server: "fs", tool: "read_file" }, action: "allow" },
      { match: { server: "fs", result_has_injection: true }, action: "deny" },
    ], "deny");
    const tainted = rec({ decision: "allow", tool: "read_file", forwarded: true, flags: ["injection:override-phrase"] });
    const r = simulate(proposed, [tainted]);
    expect(r.nowDenied).toBe(1);
  });

  it("formatSimulation renders a readable report", () => {
    const proposed = cfg([{ match: { server: "fs", tool: "write_file" }, action: "allow" }], "deny");
    const out = formatSimulation(simulate(proposed, [rec({ decision: "allow", tool: "read_file" })]));
    expect(out).toContain("1 call");
    expect(out).toMatch(/now denied/i);
    expect(out).toContain("read_file");
  });

  describe("verdict-to-verdict replay", () => {
    const askAll = cfg([], "approve");

    it("approved-by-user row is unchanged under the same approve policy", () => {
      const r = simulate(askAll, [rec({ decision: "allow", approvalActor: "user", reason: "approved by user" })]);
      expect(r.changes).toHaveLength(0);
      expect(r.unchanged).toBe(1);
    });

    it("denied-by-user and timeout rows are unchanged", () => {
      const r = simulate(askAll, [
        rec({ decision: "deny", approvalActor: "user", reason: "denied by user", forwarded: false }),
        rec({ decision: "deny", approvalActor: "timeout", reason: "user did not approve", forwarded: false }),
      ]);
      expect(r.changes).toHaveLength(0);
    });

    it("rate-limited row is unchanged under an allow policy", () => {
      const allow = cfg([{ match: { server: "fs", tool: "read_file" }, action: "allow" }]);
      const r = simulate(allow, [rec({ decision: "deny", reason: "rate limit exceeded", forwarded: false })]);
      expect(r.changes).toHaveLength(0);
    });

    it("result-phase approved row is unchanged", () => {
      const p = cfg([
        { match: { server: "fs", tool: "read_file" }, action: "allow" },
        { match: { server: "fs", result_has_injection: true }, action: "approve" },
      ]);
      const row = rec({
        decision: "allow", approvalActor: "user", reason: "matched policy #0",
        flags: ["injection:override-phrase"],
      });
      expect(simulate(p, [row]).changes).toHaveLength(0);
    });

    it("policyDecision column takes precedence over inference", () => {
      const row = rec({ decision: "deny", reason: "rate limit exceeded", policyDecision: "deny" });
      expect(historicalPolicyDecision(row)).toBe("deny");
      expect(historicalPolicyDecision({ ...row, policyDecision: null })).toBe("allow");
    });

    it("infers verdicts for legacy rows", () => {
      expect(historicalPolicyDecision(rec({ reason: "flagged result not approved (x)", decision: "deny" }))).toBe("approve");
      expect(historicalPolicyDecision(rec({ decision: "allow", approvalActor: "user" }))).toBe("approve");
      expect(historicalPolicyDecision(rec({ decision: "deny" }))).toBe("deny");
    });

    it("skips unknown-tool and internal-error rows", () => {
      const r = simulate(cfg([], "allow"), [
        rec({ decision: "deny", reason: "unknown tool nope", forwarded: false }),
        rec({ decision: "deny", reason: "internal error (boom)", forwarded: false }),
      ]);
      expect(r.skipped).toBe(2);
      expect(r.total).toBe(2);
      expect(r.unchanged).toBe(0);
      expect(r.changes).toHaveLength(0);
    });

    it("counts approve -> deny in nowDenied with from: approve", () => {
      const r = simulate(cfg([], "deny"), [rec({ policyDecision: "approve", decision: "allow" })]);
      expect(r.nowDenied).toBe(1);
      expect(r.changes[0]).toMatchObject({ from: "approve", to: "deny" });
    });

    it("approximate counts redacted rows only when an args rule exists", () => {
      const row = rec({ argsJson: '{"k":"[REDACTED:secret:aws-access-key]"}', decision: "allow" });
      const plain = cfg([{ match: { server: "fs", tool: "read_file" }, action: "allow" }]);
      const withArgs = cfg([
        { match: { server: "fs", tool: "read_file", args: { k: "x*" } }, action: "allow" },
      ]);
      expect(simulate(plain, [row]).approximate).toBe(0);
      expect(simulate(withArgs, [row, rec()]).approximate).toBe(1);
    });

    it("formatSimulation prints skipped line and approximate note only when > 0", () => {
      const base = { total: 1, unchanged: 1, nowDenied: 0, nowAllowed: 0, nowPrompt: 0, changes: [] };
      const quiet = formatSimulation({ ...base, skipped: 0, approximate: 0 });
      expect(quiet).not.toMatch(/skipped/);
      expect(quiet).not.toMatch(/Note:/);
      const loud = formatSimulation({ ...base, skipped: 2, approximate: 3 });
      expect(loud).toContain("  skipped:           2   (never reached policy: unknown tool / internal error)");
      expect(loud).toContain("Note: 3 replayed calls had redacted arguments; rules matching on args may be approximate.");
      expect(loud).toContain("(were allowed or asked before)");
    });
  });
});
