import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { parseConfigText } from "../config/load.js";
import type { WardenConfig } from "../config/schema.js";
import { simulate } from "../simulate.js";
import { applyRulesToText, rulesFromText } from "../policy/rules-doc.js";
import type { ToolRegistry } from "../registry.js";
import type { ApprovalAction, ApprovalManager } from "../approval/manager.js";
import type { AuditStore } from "../audit/store.js";
import { DASHBOARD_HTML } from "./ui.js";

export interface DashboardHandle {
  port: number;
  broadcast(event: string, data: unknown): void;
  close(): Promise<void>;
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const MAX_BODY = 1_000_000;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Over-limit bodies are drained (not buffered) so the 413 reaches the client.
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on("end", () =>
      size > MAX_BODY ? reject(new HttpError(413, "request body too large")) : resolve(Buffer.concat(chunks).toString("utf8")),
    );
    req.on("error", reject);
  });
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  try {
    const v = JSON.parse(raw) as unknown;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new HttpError(400, "invalid JSON body");
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

// CSRF: a page in the user's browser can POST to 127.0.0.1 (simple requests skip CORS
// preflight). Requiring a JSON content-type forces a preflight for cross-origin pages,
// and a present Origin must be this dashboard itself.
function csrfOk(req: http.IncomingMessage, port: number): boolean {
  if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

const RESTRICTED_MSG =
  "Only policies, limits, defaults and scanner can be changed here — edit servers/audit/dashboard in the file directly.";

// Resolves the YAML to act on: raw text, or the current file with UI rules merged in.
function resolveYaml(configPath: string, b: Record<string, unknown>): string {
  if (b.rules !== undefined) return applyRulesToText(readFileSync(configPath, "utf8"), b.rules);
  if (typeof b.yaml !== "string") throw new HttpError(400, "yaml must be a string");
  return b.yaml;
}

function policyPreview(deps: DashboardDeps, configPath: string, b: Record<string, unknown>): { status: number; body: unknown } {
  try {
    const yaml = resolveYaml(configPath, b);
    const cfg = parseConfigText(yaml, "warden.yaml");
    return { status: 200, body: { ok: true, yaml, result: simulate(cfg, deps.audit.query({ limit: 5000 })) } };
  } catch (e) {
    return { status: 400, body: { ok: false, error: (e as Error).message } };
  }
}

function catalog(deps: DashboardDeps): { servers: Record<string, string[]> } {
  const sets = new Map<string, Set<string>>();
  const add = (s: string, t: string) => {
    if (!sets.has(s)) sets.set(s, new Set());
    sets.get(s)!.add(t);
  };
  for (const [s, tools] of Object.entries(deps.registry?.catalog() ?? {})) for (const t of tools) add(s, t);
  for (const r of deps.audit.query({ limit: 5000 })) if (r.server !== "unknown") add(r.server, r.tool);
  const servers: Record<string, string[]> = {};
  for (const s of [...sets.keys()].sort()) servers[s] = [...sets.get(s)!].sort();
  return { servers };
}

function policyApply(configPath: string, b: Record<string, unknown>): { status: number; body: unknown } {
  const hash = b.hash;
  if (typeof hash !== "string" || (b.rules === undefined && typeof b.yaml !== "string")) {
    return { status: 400, body: { ok: false, error: "yaml and hash must be strings" } };
  }
  const current = readFileSync(configPath, "utf8");
  if (hash !== sha256(current)) {
    return { status: 409, body: { ok: false, error: "warden.yaml changed since you loaded it — reload and re-apply" } };
  }
  let yaml: string;
  let next: WardenConfig;
  let cur: WardenConfig;
  try {
    yaml = resolveYaml(configPath, b);
    next = parseConfigText(yaml, "warden.yaml");
    cur = parseConfigText(current, "warden.yaml");
  } catch (e) {
    return { status: 400, body: { ok: false, error: (e as Error).message } };
  }
  const same =
    isDeepStrictEqual(next.servers, cur.servers) &&
    isDeepStrictEqual(next.audit, cur.audit) &&
    isDeepStrictEqual(next.dashboard, cur.dashboard) &&
    next.approval_timeout_ms === cur.approval_timeout_ms;
  if (!same) return { status: 400, body: { ok: false, error: RESTRICTED_MSG } };
  // Write in place (not tmp+rename): fs.watch on Linux/macOS follows the inode, so a
  // rename would silently stop hot-reload for every later edit.
  writeFileSync(configPath, yaml);
  return { status: 200, body: { ok: true, hash: sha256(yaml), yaml } };
}

function isLoopbackHost(hostHeader: string): boolean {
  // IPv6 loopback is bracketed, e.g. "[::1]" or "[::1]:9977" — the trailing
  // ":port" can't be split off with a naive split(":") since the address
  // itself contains colons. Strip a trailing ":port" only when the header
  // does NOT start with "[".
  const host = hostHeader.startsWith("[")
    ? hostHeader.replace(/^(\[[^\]]*\]).*$/, "$1")
    : hostHeader.split(":")[0];
  const normalized = host.toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "[::1]" || normalized === "::1";
}

function tryListen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (e: Error) => reject(e);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

async function listenWithFallback(server: http.Server, preferred: number): Promise<number> {
  for (let p = preferred; ; p++) {
    try {
      return await tryListen(server, p);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE" || p >= preferred + 20) throw e;
      console.error(`[warden] port ${p} busy, trying ${p + 1}`);
    }
  }
}

export interface DashboardDeps {
  approvals: ApprovalManager;
  audit: AuditStore;
  configPath?: string;
  registry?: ToolRegistry;
}

export async function startDashboard(
  deps: DashboardDeps,
  preferredPort: number,
): Promise<DashboardHandle> {
  const clients = new Set<http.ServerResponse>();
  const broadcast = (event: string, data: unknown): void => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
  };
  const onPending = (p: unknown) => broadcast("pending", p);
  const onResolved = (r: unknown) => broadcast("resolved", r);
  deps.approvals.on("pending", onPending);
  deps.approvals.on("resolved", onResolved);

  const server = http.createServer(async (req, res) => {
    const hostHeader = req.headers.host ?? "";
    if (!isLoopbackHost(hostHeader)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden host" }));
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "POST" && !csrfOk(req, (server.address() as AddressInfo).port)) {
        json(res, 403, { ok: false, error: "forbidden: JSON content-type and same-origin required" });
        req.resume();
        return;
      }
      const configPath = deps.configPath;
      if (configPath && req.method === "GET" && url.pathname === "/api/policy") {
        const yaml = readFileSync(configPath, "utf8");
        let rules = null;
        try { rules = rulesFromText(yaml); } catch { /* unparsable file: UI falls back to YAML mode */ }
        json(res, 200, { yaml, hash: sha256(yaml), rules, catalog: catalog(deps) });
      } else if (configPath && req.method === "POST" && url.pathname === "/api/policy/preview") {
        const out = policyPreview(deps, configPath, await readJson(req));
        json(res, out.status, out.body);
      } else if (configPath && req.method === "POST" && url.pathname === "/api/policy/render") {
        const b = await readJson(req);
        try {
          json(res, 200, { ok: true, yaml: applyRulesToText(readFileSync(configPath, "utf8"), b.rules) });
        } catch (e) {
          json(res, 400, { ok: false, error: (e as Error).message });
        }
      } else if (configPath && req.method === "POST" && url.pathname === "/api/policy/parse") {
        const b = await readJson(req);
        try {
          if (typeof b.yaml !== "string") throw new Error("yaml must be a string");
          json(res, 200, { ok: true, rules: rulesFromText(b.yaml) });
        } catch (e) {
          json(res, 400, { ok: false, error: (e as Error).message });
        }
      } else if (configPath && req.method === "POST" && url.pathname === "/api/policy/apply") {
        const out = policyApply(configPath, await readJson(req));
        json(res, out.status, out.body);
      } else if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(DASHBOARD_HTML);
      } else if (req.method === "GET" && url.pathname === "/api/health") {
        json(res, 200, { ok: true, pid: process.pid });
      } else if (req.method === "GET" && url.pathname === "/api/pending") {
        json(res, 200, deps.approvals.list());
      } else if (req.method === "POST" && url.pathname.startsWith("/api/pending/")) {
        const id = url.pathname.slice("/api/pending/".length);
        const body = (await readJson(req)) as { action: ApprovalAction };
        const ok = deps.approvals.resolve(id, body.action);
        json(res, ok ? 200 : 404, { ok });
      } else if (req.method === "GET" && url.pathname === "/api/audit") {
        json(res, 200, deps.audit.query({
          server: url.searchParams.get("server") ?? undefined,
          decision: url.searchParams.get("decision") ?? undefined,
          limit: url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined,
        }));
      } else if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
      } else {
        json(res, 404, { error: "not found" });
      }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      json(res, status, { ok: false, error: (e as Error).message });
    }
  });

  const port = await listenWithFallback(server, preferredPort);
  return {
    port,
    broadcast,
    close: async () => {
      deps.approvals.off("pending", onPending);
      deps.approvals.off("resolved", onResolved);
      for (const res of clients) res.end();
      clients.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
