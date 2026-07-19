import { describe, it, expect } from "vitest";
import { simulate, formatSimulation } from "../src/simulate.js";
import type { AuditRecord } from "../src/audit/store.js";
import type { PolicyRule, Action } from "../src/config/schema.js";

const rec = (over: Partial<AuditRecord>): AuditRecord => ({
  id: crypto.randomUUID(), ts: Date.now(), server: "fs", tool: "read_file",
  argsJson: "{}", decision: "allow", ruleIndex: 0, reason: null, flags: [], forwarded: true,
  approvalActor: null, approvalMs: null, resultBytes: 1, durationMs: 1, error: null,
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
});
