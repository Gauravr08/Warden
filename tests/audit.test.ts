import { describe, it, expect, beforeEach } from "vitest";
import { AuditStore, redactSecrets, type AuditRecord } from "../src/audit/store.js";

const rec = (over: Partial<AuditRecord>): AuditRecord => ({
  id: crypto.randomUUID(), ts: Date.now(), server: "github", tool: "get_issue",
  argsJson: "{}", decision: "allow", ruleIndex: 0, flags: [], forwarded: true,
  approvalActor: null, approvalMs: null, resultBytes: 10, durationMs: 5, error: null,
  ...over,
});

let store: AuditStore;
beforeEach(() => { store = new AuditStore(":memory:"); });

describe("AuditStore", () => {
  it("inserts and queries newest-first with filters", () => {
    store.insert(rec({ ts: 1000, tool: "a" }));
    store.insert(rec({ ts: 2000, tool: "b", decision: "deny", forwarded: false }));
    expect(store.query()).toHaveLength(2);
    expect(store.query()[0].tool).toBe("b");
    expect(store.query({ decision: "deny" })).toHaveLength(1);
    expect(store.query({ limit: 1 })).toHaveLength(1);
  });

  it("redacts secrets on insert", () => {
    store.insert(rec({ argsJson: JSON.stringify({ k: "AKIAIOSFODNN7EXAMPLE" }) }));
    expect(store.query()[0].argsJson).toContain("[REDACTED:secret:aws-access-key]");
    expect(store.query()[0].argsJson).not.toContain("AKIA");
  });

  it("counts forwarded calls per server and per tool since ts", () => {
    store.insert(rec({ ts: 1000 }));
    store.insert(rec({ ts: 2000, tool: "other" }));
    store.insert(rec({ ts: 3000, forwarded: false }));
    expect(store.countForwardedSince("github", null, 0)).toBe(2);
    expect(store.countForwardedSince("github", "get_issue", 0)).toBe(1);
    expect(store.countForwardedSince("github", null, 1500)).toBe(1);
  });

  it("purges old rows", () => {
    store.insert(rec({ ts: 1000 }));
    store.insert(rec({ ts: 9000 }));
    expect(store.purgeOlderThan(5000)).toBe(1);
    expect(store.query()).toHaveLength(1);
  });
});

describe("redactSecrets", () => {
  it("replaces all occurrences", () => {
    const out = redactSecrets("a AKIAIOSFODNN7EXAMPLE b AKIAIOSFODNN7EXAMPLE");
    expect(out.match(/REDACTED/g)).toHaveLength(2);
  });
});
