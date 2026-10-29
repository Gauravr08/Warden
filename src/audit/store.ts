import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SECRET_PATTERNS } from "../scanner/secrets.js";

export interface AuditRecord {
  id: string; ts: number; server: string; tool: string;
  argsJson: string; decision: string; ruleIndex: number | null;
  reason: string | null;
  policyDecision: string | null; // policy verdict before rate limit / human input; null if policy never ran
  flags: string[]; forwarded: boolean;
  approvalActor: string | null; approvalMs: number | null;
  resultBytes: number | null; durationMs: number | null; error: string | null;
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const { flag, re } of SECRET_PATTERNS) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    out = out.replace(global, `[REDACTED:${flag}]`);
  }
  return out;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL,
  server TEXT NOT NULL, tool TEXT NOT NULL,
  args_json TEXT NOT NULL, decision TEXT NOT NULL,
  rule_index INTEGER, reason TEXT, policy_decision TEXT, flags TEXT NOT NULL DEFAULT '[]',
  forwarded INTEGER NOT NULL DEFAULT 0,
  approval_actor TEXT, approval_ms INTEGER,
  result_bytes INTEGER, duration_ms INTEGER, error TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);
CREATE INDEX IF NOT EXISTS idx_audit_server_ts ON audit(server, ts);
`;

interface Row {
  id: string; ts: number; server: string; tool: string;
  args_json: string; decision: string; rule_index: number | null;
  reason: string | null; policy_decision: string | null; flags: string; forwarded: number; approval_actor: string | null;
  approval_ms: number | null; result_bytes: number | null;
  duration_ms: number | null; error: string | null;
}

function toRecord(r: Row): AuditRecord {
  return {
    id: r.id, ts: r.ts, server: r.server, tool: r.tool,
    argsJson: r.args_json, decision: r.decision, ruleIndex: r.rule_index,
    reason: r.reason ?? null, policyDecision: r.policy_decision ?? null,
    flags: JSON.parse(r.flags) as string[], forwarded: r.forwarded === 1,
    approvalActor: r.approval_actor, approvalMs: r.approval_ms,
    resultBytes: r.result_bytes, durationMs: r.duration_ms, error: r.error,
  };
}

export class AuditStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Backward-compatible schema upgrades for audit.db files created by older versions. */
  private migrate(): void {
    const cols = this.db.prepare("PRAGMA table_info(audit)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "reason")) {
      this.db.exec("ALTER TABLE audit ADD COLUMN reason TEXT");
    }
    if (!cols.some((c) => c.name === "policy_decision")) {
      this.db.exec("ALTER TABLE audit ADD COLUMN policy_decision TEXT");
    }
  }

  insert(rec: AuditRecord): void {
    this.db.prepare(`
      INSERT INTO audit (id, ts, server, tool, args_json, decision, rule_index, reason, policy_decision, flags,
        forwarded, approval_actor, approval_ms, result_bytes, duration_ms, error)
      VALUES (@id, @ts, @server, @tool, @args_json, @decision, @rule_index, @reason, @policy_decision, @flags,
        @forwarded, @approval_actor, @approval_ms, @result_bytes, @duration_ms, @error)
    `).run({
      id: rec.id, ts: rec.ts, server: rec.server, tool: rec.tool,
      args_json: redactSecrets(rec.argsJson), decision: rec.decision,
      rule_index: rec.ruleIndex, reason: rec.reason, policy_decision: rec.policyDecision, flags: JSON.stringify(rec.flags),
      forwarded: rec.forwarded ? 1 : 0, approval_actor: rec.approvalActor,
      approval_ms: rec.approvalMs, result_bytes: rec.resultBytes,
      duration_ms: rec.durationMs, error: rec.error,
    });
  }

  query(f: { server?: string; tool?: string; decision?: string; sinceTs?: number; limit?: number } = {}): AuditRecord[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (f.server) { where.push("server = @server"); params.server = f.server; }
    if (f.tool) { where.push("tool = @tool"); params.tool = f.tool; }
    if (f.decision) { where.push("decision = @decision"); params.decision = f.decision; }
    if (f.sinceTs !== undefined) { where.push("ts >= @sinceTs"); params.sinceTs = f.sinceTs; }
    const sql = `SELECT * FROM audit ${where.length ? "WHERE " + where.join(" AND ") : ""}
                 ORDER BY ts DESC LIMIT @limit`;
    params.limit = f.limit ?? 500;
    return (this.db.prepare(sql).all(params) as Row[]).map(toRecord);
  }

  countForwardedSince(server: string, tool: string | null, sinceTs: number): number {
    const sql = tool === null
      ? "SELECT COUNT(*) AS n FROM audit WHERE forwarded = 1 AND server = ? AND ts >= ?"
      : "SELECT COUNT(*) AS n FROM audit WHERE forwarded = 1 AND server = ? AND tool = ? AND ts >= ?";
    const row = tool === null
      ? (this.db.prepare(sql).get(server, sinceTs) as { n: number })
      : (this.db.prepare(sql).get(server, tool, sinceTs) as { n: number });
    return row.n;
  }

  forwardedToolsSince(server: string, sinceTs: number): string[] {
    return (this.db.prepare(
      "SELECT tool FROM audit WHERE forwarded = 1 AND server = ? AND ts >= ?",
    ).all(server, sinceTs) as { tool: string }[]).map((r) => r.tool);
  }

  purgeOlderThan(ts: number): number {
    return this.db.prepare("DELETE FROM audit WHERE ts < ?").run(ts).changes;
  }

  close(): void {
    this.db.close();
  }
}
