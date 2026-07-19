import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { AuditStore, redactSecrets, type AuditRecord } from "../src/audit/store.js";

const rec = (over: Partial<AuditRecord>): AuditRecord => ({
  id: crypto.randomUUID(), ts: Date.now(), server: "github", tool: "get_issue",
  argsJson: "{}", decision: "allow", ruleIndex: 0, reason: "matched policy #0", flags: [], forwarded: true,
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

  it("persists and returns the decision reason", () => {
    store.insert(rec({ reason: "matched policy #7 (args phase)" }));
    expect(store.query()[0].reason).toBe("matched policy #7 (args phase)");
  });
});

describe("AuditStore reason-column migration", () => {
  it("adds the reason column to a pre-existing db that lacks it", () => {
    const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "warden-mig-")), "audit.db");
    // Simulate an OLD db created before the reason column existed.
    const old = new Database(dbPath);
    old.exec(`CREATE TABLE audit (
      id TEXT PRIMARY KEY, ts INTEGER NOT NULL, server TEXT NOT NULL, tool TEXT NOT NULL,
      args_json TEXT NOT NULL, decision TEXT NOT NULL, rule_index INTEGER,
      flags TEXT NOT NULL DEFAULT '[]', forwarded INTEGER NOT NULL DEFAULT 0,
      approval_actor TEXT, approval_ms INTEGER, result_bytes INTEGER, duration_ms INTEGER, error TEXT
    );`);
    old.prepare(`INSERT INTO audit (id, ts, server, tool, args_json, decision, flags)
      VALUES ('old1', 1, 's', 't', '{}', 'allow', '[]')`).run();
    old.close();

    // Opening with the current AuditStore must migrate (ALTER TABLE ADD COLUMN reason).
    const migrated = new AuditStore(dbPath);
    expect(migrated.query()[0].reason).toBeNull(); // old row: reason is null, no crash
    migrated.insert(rec({ id: "new1", ts: 2, reason: "matched policy #1" }));
    const fresh = migrated.query({ limit: 10 }).find((r) => r.id === "new1");
    expect(fresh?.reason).toBe("matched policy #1");
    migrated.close();
  });
});

describe("redactSecrets", () => {
  it("replaces all occurrences", () => {
    const out = redactSecrets("a AKIAIOSFODNN7EXAMPLE b AKIAIOSFODNN7EXAMPLE");
    expect(out.match(/REDACTED/g)).toHaveLength(2);
  });
});
