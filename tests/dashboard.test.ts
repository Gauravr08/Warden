import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startDashboard, type DashboardHandle } from "../src/dashboard/server.js";
import { ApprovalManager } from "../src/approval/manager.js";
import { AuditStore } from "../src/audit/store.js";
import { ToolRegistry } from "../src/registry.js";
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
  it("ships a syntactically valid dashboard script with the simple editor", () => {
    const script = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf("<script>") + 8, DASHBOARD_HTML.indexOf("</script>"));
    expect(() => new Function(script)).not.toThrow();
    expect(DASHBOARD_HTML).toContain('id="simple"');
    expect(DASHBOARD_HTML).toContain("Add from template");
  });

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
      ruleIndex: null, reason: "matched policy #0", flags: [], forwarded: false, policyDecision: null, approvalActor: null,
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
    // args are pretty-printed, and still escaped as a whole before innerHTML
    expect(DASHBOARD_HTML).toContain("esc(JSON.stringify(p.args, null, 2))");

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

describe("dashboard Policy tab UI", () => {
  it("has the Policy tab, its controls, and a warning banner", () => {
    expect(DASHBOARD_HTML).toContain('id="tab-policy"');
    expect(DASHBOARD_HTML).toContain("Preview changes");
    expect(DASHBOARD_HTML).toContain("Reload from file");
    expect(DASHBOARD_HTML).toContain("Nothing is saved until you click Apply.");
    expect(DASHBOARD_HTML).toContain('addEventListener("warning"');
  });

  it("escapes every server value in the changes table and errors", () => {
    expect(DASHBOARD_HTML).toContain("esc(c.server)");
    expect(DASHBOARD_HTML).toContain("esc(c.tool)");
    expect(DASHBOARD_HTML).toContain("verdict(c.from)");
    expect(DASHBOARD_HTML).toContain("verdict(c.to)");
    expect(DASHBOARD_HTML).toContain("esc(a ? a[1] : d)");
    expect(DASHBOARD_HTML).toContain("esc(why)");
    expect(DASHBOARD_HTML).toContain("esc(e.message)");
    expect(DASHBOARD_HTML).toContain("esc(msg)");
    // the editor is filled via .value, never innerHTML
    expect(DASHBOARD_HTML).toContain("$(\"yaml\").value =");
    expect(DASHBOARD_HTML).not.toMatch(/\+\s*c\.(server|tool|from|to|reason)\s*\+/);
  });
});

describe("dashboard policy API + CSRF guard", () => {
  const BASE = `servers:
  echo:
    command: node
    args: [x.mjs]
defaults: { action: deny }
policies:
  - match: { server: echo, tool: echo }
    action: allow
dashboard: { port: 0 }
audit: { db_path: ":memory:" }
`;
  let dir: string;
  let cfgPath: string;
  let pdash: DashboardHandle;
  let pAudit: AuditStore;
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "warden-pol-"));
    cfgPath = path.join(dir, "warden.yaml");
    writeFileSync(cfgPath, BASE);
    pAudit = new AuditStore(":memory:");
    pdash = await startDashboard({ approvals: new ApprovalManager(5000), audit: pAudit, configPath: cfgPath }, 0);
  });
  afterEach(async () => { await pdash.close(); pAudit.close(); });

  function post(
    p: string,
    body: string,
    headers: Record<string, string> = { "content-type": "application/json" },
  ): Promise<{ status: number; json: any }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: pdash.port, path: p, method: "POST", headers },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            let json: any = null;
            try { json = JSON.parse(data); } catch { /* non-json */ }
            resolve({ status: res.statusCode ?? 0, json });
          });
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }
  const getPolicy = async () => (await fetch(`http://127.0.0.1:${pdash.port}/api/policy`)).json();
  const seed = (id: string, tool: string, decision: string) =>
    pAudit.insert({
      id, ts: 1, server: "echo", tool, argsJson: "{}", decision, ruleIndex: null, reason: "x",
      flags: [], forwarded: decision === "allow", policyDecision: decision, approvalActor: null,
      approvalMs: null, resultBytes: null, durationMs: 1, error: null,
    });

  it("GET /api/policy returns file text + sha256; 404 without configPath", async () => {
    const body = await getPolicy();
    expect(body.yaml).toBe(BASE);
    expect(body.hash).toBe(sha(BASE));
    const res = await fetch(api("/api/policy")); // top-level dash has no configPath
    expect(res.status).toBe(404);
    const postJson = await fetch(api("/api/policy/preview"), {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    expect(postJson.status).toBe(404);
  });

  it("preview returns a SimResult for valid YAML and 400 for invalid", async () => {
    seed("1", "echo", "allow");
    seed("2", "echo", "allow");
    const denied = BASE.replace("action: allow", "action: deny");
    const ok = await post("/api/policy/preview", JSON.stringify({ yaml: denied }));
    expect(ok.status).toBe(200);
    expect(ok.json.ok).toBe(true);
    expect(ok.json.result.total).toBe(2);
    expect(ok.json.result.nowDenied).toBe(2);
    const bad = await post("/api/policy/preview", JSON.stringify({ yaml: "policies:\n  - action: nope\n" }));
    expect(bad.status).toBe(400);
    expect(bad.json.ok).toBe(false);
    expect(typeof bad.json.error).toBe("string");
    expect((await post("/api/policy/preview", "{not json")).status).toBe(400);
    expect((await post("/api/policy/preview", JSON.stringify({ yaml: 5 }))).status).toBe(400);
  });

  it("apply writes the file and returns the new hash", async () => {
    const { hash } = await getPolicy();
    const next = BASE.replace("action: allow", "action: deny");
    const res = await post("/api/policy/apply", JSON.stringify({ yaml: next, hash }));
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, hash: sha(next), yaml: next });
    expect(readFileSync(cfgPath, "utf8")).toBe(next);
    expect(readdirSync(dir)).toEqual(["warden.yaml"]); // no stray .tmp
  });

  it("apply with a stale hash is 409 and leaves the file untouched", async () => {
    const { hash } = await getPolicy();
    writeFileSync(cfgPath, BASE + "# changed meanwhile\n");
    const res = await post("/api/policy/apply", JSON.stringify({ yaml: BASE, hash }));
    expect(res.status).toBe(409);
    expect(res.json.error).toContain("changed since you loaded it");
    expect(readFileSync(cfgPath, "utf8")).toBe(BASE + "# changed meanwhile\n");
  });

  it.each([
    ["servers", BASE.replace("command: node", "command: evil")],
    ["audit", BASE.replace('db_path: ":memory:"', 'db_path: "/tmp/other.db"')],
    ["dashboard", BASE.replace("port: 0", "port: 1234")],
    ["approval_timeout_ms", BASE + "approval_timeout_ms: 5\n"],
  ])("apply refuses changes to %s and leaves the file untouched", async (_name, next) => {
    const { hash } = await getPolicy();
    const res = await post("/api/policy/apply", JSON.stringify({ yaml: next, hash }));
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("Only policies, limits, defaults and scanner can be changed here");
    expect(readFileSync(cfgPath, "utf8")).toBe(BASE);
  });

  it("apply rejects invalid YAML / bad bodies and leaves the file untouched", async () => {
    const { hash } = await getPolicy();
    const res = await post("/api/policy/apply", JSON.stringify({ yaml: "policies:\n  - action: nope\n", hash }));
    expect(res.status).toBe(400);
    expect((await post("/api/policy/apply", JSON.stringify({ yaml: BASE }))).status).toBe(400); // no hash
    expect(readFileSync(cfgPath, "utf8")).toBe(BASE);
  });

  it("CSRF: POST without a JSON content-type is 403 on every POST route", async () => {
    const { hash } = await getPolicy();
    const body = JSON.stringify({ yaml: BASE, hash });
    for (const p of ["/api/policy/preview", "/api/policy/apply", "/api/pending/x"]) {
      expect((await post(p, body, { "content-type": "text/plain" })).status).toBe(403);
      expect((await post(p, body, {})).status).toBe(403);
    }
  });

  it("CSRF: a foreign or null Origin is 403; same-origin is allowed", async () => {
    const body = JSON.stringify({ yaml: BASE });
    const json = { "content-type": "application/json" };
    for (const origin of ["http://evil.example", "null", `http://127.0.0.1:${pdash.port + 1}`, `https://127.0.0.1:${pdash.port}`]) {
      const r = await post("/api/policy/preview", body, { ...json, origin });
      expect(r.status).toBe(403);
    }
    // a foreign Origin must not reach apply either, even with a valid hash
    const { hash } = await getPolicy();
    const evil = await post("/api/policy/apply", JSON.stringify({ yaml: BASE.replace("allow", "deny"), hash }), {
      ...json, origin: "http://evil.example",
    });
    expect(evil.status).toBe(403);
    expect(readFileSync(cfgPath, "utf8")).toBe(BASE);

    for (const origin of [`http://127.0.0.1:${pdash.port}`, `http://localhost:${pdash.port}`]) {
      expect((await post("/api/policy/preview", body, { ...json, origin })).status).toBe(200);
    }
    expect((await post("/api/policy/preview", body, json)).status).toBe(200); // no Origin (curl/CLI)
  });

  it("body over 1 MB is 413", async () => {
    const big = JSON.stringify({ yaml: "#" + "a".repeat(1_100_000) });
    const res = await post("/api/policy/preview", big);
    expect(res.status).toBe(413);
  });
  it("GET /api/policy includes rules and a sorted catalog from the audit log", async () => {
    seed("1", "write", "allow");
    seed("2", "echo", "allow");
    pAudit.insert({
      id: "3", ts: 1, server: "unknown", tool: "x", argsJson: "{}", decision: "deny", ruleIndex: null, reason: "x",
      flags: [], forwarded: false, policyDecision: "deny", approvalActor: null, approvalMs: null, resultBytes: null,
      durationMs: 1, error: null,
    });
    const body = await getPolicy();
    expect(body.rules).toEqual({
      defaults: { action: "deny" },
      policies: [{ match: { server: "echo", tool: "echo" }, action: "allow" }],
      limits: [],
      allowed_roots: [],
    });
    expect(body.catalog).toEqual({ servers: { echo: ["echo", "write"] } });
  });

  it("catalog merges the live registry", async () => {
    const registry = new ToolRegistry();
    registry.refresh(new Map([["git", [{ name: "status", inputSchema: { type: "object" } }]]]));
    const d = await startDashboard(
      { approvals: new ApprovalManager(5000), audit: pAudit, configPath: cfgPath, registry }, 0);
    try {
      const body = await (await fetch(`http://127.0.0.1:${d.port}/api/policy`)).json();
      expect(body.catalog.servers.git).toEqual(["status"]);
    } finally {
      await d.close();
    }
  });

  const RULES = {
    defaults: { action: "approve" },
    policies: [
      { match: { args_contain_secret: true }, action: "deny" },
      { match: { server: "echo", tool: "echo" }, action: "allow" },
    ],
    limits: [{ match: { tool: "echo" }, max_calls_per_hour: 5 }],
    allowed_roots: ["~/projects"],
  };

  it("preview accepts rules and returns the merged yaml", async () => {
    seed("1", "echo", "allow");
    const res = await post("/api/policy/preview", JSON.stringify({ rules: RULES }));
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.result.total).toBe(1);
    expect(res.json.yaml).toContain("command: node");
    expect(res.json.yaml).toContain("~/projects");
    expect(readFileSync(cfgPath, "utf8")).toBe(BASE);
  });

  it("apply with rules writes the merged file, keeps servers, returns the new hash", async () => {
    const { hash } = await getPolicy();
    const res = await post("/api/policy/apply", JSON.stringify({ rules: RULES, hash }));
    expect(res.status).toBe(200);
    const written = readFileSync(cfgPath, "utf8");
    expect(res.json.hash).toBe(sha(written));
    expect(res.json.yaml).toBe(written);
    expect(written).toMatch(/args: \[ ?x\.mjs ?\]/);
    expect(written).toContain("max_calls_per_hour: 5");
    const body = await getPolicy();
    expect(body.rules).toEqual(RULES);
    const stale = await post("/api/policy/apply", JSON.stringify({ rules: RULES, hash }));
    expect(stale.status).toBe(409);
  });

  it("rejects invalid rules with 400", async () => {
    const bad = { ...RULES, defaults: { action: "nope" } };
    const p = await post("/api/policy/preview", JSON.stringify({ rules: bad }));
    expect(p.status).toBe(400);
    expect(p.json.error).toContain("defaults");
    const { hash } = await getPolicy();
    expect((await post("/api/policy/apply", JSON.stringify({ rules: bad, hash }))).status).toBe(400);
    expect((await post("/api/policy/render", JSON.stringify({ rules: bad }))).status).toBe(400);
    expect(readFileSync(cfgPath, "utf8")).toBe(BASE);
  });

  it("render merges rules without writing; parse returns rules", async () => {
    const r = await post("/api/policy/render", JSON.stringify({ rules: RULES }));
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(readFileSync(cfgPath, "utf8")).toBe(BASE);
    const p = await post("/api/policy/parse", JSON.stringify({ yaml: r.json.yaml }));
    expect(p.status).toBe(200);
    expect(p.json.rules).toEqual(RULES);
  });

  it("parse of bad YAML or a non-string is 400", async () => {
    const bad = await post("/api/policy/parse", JSON.stringify({ yaml: "policies: [" }));
    expect(bad.status).toBe(400);
    expect(bad.json.ok).toBe(false);
    expect((await post("/api/policy/parse", JSON.stringify({ yaml: 5 }))).status).toBe(400);
  });

  it("new POST routes enforce the CSRF guard", async () => {
    for (const p of ["/api/policy/render", "/api/policy/parse"]) {
      const body = JSON.stringify({ rules: RULES, yaml: BASE });
      expect((await post(p, body, { "content-type": "text/plain" })).status).toBe(403);
      expect((await post(p, body, { "content-type": "application/json", origin: "http://evil.example" })).status).toBe(403);
    }
  });
});

describe("dashboard explainability", () => {
  it("has a Why column driven by the audit reason (escaped)", () => {
    expect(DASHBOARD_HTML).toContain("<th>Why</th>"); // header present
    expect(DASHBOARD_HTML).toContain("r.reason"); // the row renders the persisted reason
    expect(DASHBOARD_HTML).toContain("esc(r.reason)"); // and escapes it before innerHTML
  });
});
