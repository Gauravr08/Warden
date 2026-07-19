import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { startDashboard, type DashboardHandle } from "../src/dashboard/server.js";
import { ApprovalManager } from "../src/approval/manager.js";
import { AuditStore } from "../src/audit/store.js";
import { DASHBOARD_HTML } from "../src/dashboard/ui.js";

let approvals: ApprovalManager;
let audit: AuditStore;
let dash: DashboardHandle;

beforeEach(async () => {
  approvals = new ApprovalManager(5000);
  audit = new AuditStore(":memory:");
  dash = await startDashboard({ approvals, audit }, 0); // port 0 = ephemeral
});
afterEach(async () => { await dash.close(); audit.close(); });

const api = (p: string) => `http://127.0.0.1:${dash.port}${p}`;

// Node's fetch (undici) refuses to let callers override the Host header (it's a
// forbidden request header), so a spoofed-Host request must go through raw
// node:http instead to genuinely exercise the guard.
function rawRequest(
  path: string,
  opts: { host?: string; method?: string } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: dash.port,
        path,
        method: opts.method ?? "GET",
        headers: opts.host !== undefined ? { host: opts.host } : {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("dashboard", () => {
  it("serves html and health", async () => {
    const html = await fetch(api("/"));
    expect(html.status).toBe(200);
    expect(await html.text()).toContain("<title>warden</title>");
    const health = await (await fetch(api("/api/health"))).json();
    expect(health.ok).toBe(true);
  });

  it("lists pending and resolves via POST", async () => {
    const outcome = approvals.request({ server: "gh", tool: "del", args: {}, flags: [], phase: "call" });
    const pending = await (await fetch(api("/api/pending"))).json();
    expect(pending).toHaveLength(1);
    const res = await fetch(api(`/api/pending/${pending[0].id}`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    expect((await res.json()).ok).toBe(true);
    await expect(outcome).resolves.toMatchObject({ approved: true });
  });

  it("404s on unknown approval id", async () => {
    const res = await fetch(api("/api/pending/nope"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "deny" }),
    });
    expect(res.status).toBe(404);
  });

  it("serves filtered audit", async () => {
    audit.insert({
      id: "1", ts: 1, server: "gh", tool: "x", argsJson: "{}", decision: "deny",
      ruleIndex: null, reason: "matched policy #0", flags: [], forwarded: false, approvalActor: null,
      approvalMs: null, resultBytes: null, durationMs: 1, error: null,
    });
    const rows = await (await fetch(api("/api/audit?decision=deny"))).json();
    expect(rows).toHaveLength(1);
    expect((await (await fetch(api("/api/audit?decision=allow"))).json())).toHaveLength(0);
  });

  it("rejects requests with a non-loopback Host header (anti-DNS-rebinding)", async () => {
    const res = await rawRequest("/api/pending", { host: "evil.example.com" });
    expect(res.status).toBe(403);
  });

  it("allows a localhost Host header", async () => {
    const res = await fetch(`http://localhost:${dash.port}/api/health`);
    expect(res.status).toBe(200);
  });

  it("streams SSE pending events", async () => {
    const res = await fetch(api("/api/events"));
    const reader = res.body!.getReader();
    void approvals.request({ server: "gh", tool: "del", args: {}, flags: [], phase: "call" });
    const { value } = await reader.read(); // ": connected"
    const { value: v2 } = await reader.read();
    const text = new TextDecoder().decode(value) + new TextDecoder().decode(v2);
    expect(text).toContain("event: pending");
    await reader.cancel();
  });
});

describe("dashboard XSS hardening", () => {
  it("escapes untrusted values before innerHTML", () => {
    // an esc() helper must exist in the client script
    expect(DASHBOARD_HTML).toContain("function esc(");

    // pending card: server/tool/flags/args must be escaped before innerHTML
    expect(DASHBOARD_HTML).toContain("esc(p.server)");
    expect(DASHBOARD_HTML).toContain("esc(p.tool)");
    expect(DASHBOARD_HTML).toContain("esc(p.flags.join(");
    expect(DASHBOARD_HTML).toContain("esc(JSON.stringify(p.args))");

    // audit row: server/tool/flags/decision/durationMs must be escaped before innerHTML
    expect(DASHBOARD_HTML).toContain("esc(r.server)");
    expect(DASHBOARD_HTML).toContain("esc(r.tool)");
    expect(DASHBOARD_HTML).toContain("esc(r.flags.join(");
    expect(DASHBOARD_HTML).toContain("esc(r.decision)");
    expect(DASHBOARD_HTML).toContain("esc(r.durationMs");

    // no raw unescaped interpolation of args into innerHTML
    expect(DASHBOARD_HTML).not.toMatch(/\+\s*JSON\.stringify\(p\.args\)\s*\+/);
    // no raw r.server / r.tool concatenated directly into the audit row template
    expect(DASHBOARD_HTML).not.toMatch(/"<\/td><td>"\s*\+\s*r\.server\s*\+/);
    expect(DASHBOARD_HTML).not.toMatch(/"<\/td><td>"\s*\+\s*r\.tool\s*\+/);
  });
});

describe("dashboard explainability", () => {
  it("has a Why column driven by the audit reason (escaped)", () => {
    expect(DASHBOARD_HTML).toContain("<th>why</th>"); // header present
    expect(DASHBOARD_HTML).toContain("r.reason"); // the row renders the persisted reason
    expect(DASHBOARD_HTML).toContain("esc(r.reason)"); // and escapes it before innerHTML
  });
});
