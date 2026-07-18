import http from "node:http";
import type { AddressInfo } from "node:net";
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

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
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

export async function startDashboard(
  deps: { approvals: ApprovalManager; audit: AuditStore },
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
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(DASHBOARD_HTML);
      } else if (req.method === "GET" && url.pathname === "/api/health") {
        json(res, 200, { ok: true, pid: process.pid });
      } else if (req.method === "GET" && url.pathname === "/api/pending") {
        json(res, 200, deps.approvals.list());
      } else if (req.method === "POST" && url.pathname.startsWith("/api/pending/")) {
        const id = url.pathname.slice("/api/pending/".length);
        const body = JSON.parse(await readBody(req)) as { action: ApprovalAction };
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
      json(res, 500, { error: (e as Error).message });
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
