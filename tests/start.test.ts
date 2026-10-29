import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startGateway, watchPolicies } from "../src/cli/start.js";
import { AuditStore } from "../src/audit/store.js";
import { loadConfig } from "../src/config/load.js";

const fixture = path.resolve("tests/fixtures/echo-server.mjs").replace(/\\/g, "/");

function writeConfig(dir: string, dbPath: string): string {
  const configPath = path.join(dir, "warden.yaml");
  writeFileSync(configPath, `
servers:
  echo:
    command: ${JSON.stringify(process.execPath)}
    args: [${JSON.stringify(fixture)}]
defaults: { action: deny }
policies:
  - match: { server: echo, tool: echo }
    action: allow
dashboard: { port: 0 }
audit: { db_path: ${JSON.stringify(dbPath)} }
`);
  return configPath;
}

describe("startGateway integration", () => {
  it("serves the full stack: list, allow, deny, audit", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "warden-s-"));
    const dbPath = path.join(dir, "audit.db").replace(/\\/g, "/");
    const configPath = writeConfig(dir, dbPath);

    const prevStateEnv = process.env.WARDEN_STATE_FILE;
    process.env.WARDEN_STATE_FILE = path.join(dir, "state.json");
    try {
      const [clientT, serverT] = InMemoryTransport.createLinkedPair();
      const running = await startGateway(configPath, serverT);
      const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
      await client.connect(clientT);

      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain("echo");

      const ok = await client.callTool({ name: "echo", arguments: { message: "through the stack" } });
      expect(JSON.stringify(ok)).toContain("through the stack");

      const blocked = await client.callTool({ name: "danger", arguments: { target: "x" } });
      expect(JSON.stringify(blocked)).toContain("Blocked by warden");

      await client.close();
      await running.close();

      const audit = new AuditStore(dbPath);
      expect(audit.query()).toHaveLength(2);
      audit.close();
    } finally {
      if (prevStateEnv === undefined) delete process.env.WARDEN_STATE_FILE;
      else process.env.WARDEN_STATE_FILE = prevStateEnv;
    }
  }, 30000);

  it("applying a policy via the dashboard API hot-reloads the live config", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "warden-a-"));
    const dbPath = path.join(dir, "audit.db").replace(/\\/g, "/");
    const configPath = writeConfig(dir, dbPath);

    const prevStateEnv = process.env.WARDEN_STATE_FILE;
    process.env.WARDEN_STATE_FILE = path.join(dir, "state.json");
    try {
      const [clientT, serverT] = InMemoryTransport.createLinkedPair();
      const running = await startGateway(configPath, serverT);
      const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
      await client.connect(clientT);
      const base = `http://127.0.0.1:${running.dashboardPort}`;

      const ok = await client.callTool({ name: "echo", arguments: { message: "before" } });
      expect(JSON.stringify(ok)).toContain("before");

      const { yaml, hash } = await (await fetch(`${base}/api/policy`)).json();
      const res = await fetch(`${base}/api/policy/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ yaml: yaml.replace("action: allow", "action: deny"), hash }),
      });
      expect(res.status).toBe(200);

      await vi.waitFor(
        async () => {
          const r = await client.callTool({ name: "echo", arguments: { message: "after" } });
          expect(JSON.stringify(r)).toContain("Blocked by warden");
        },
        { timeout: 5000, interval: 100 },
      );

      await client.close();
      await running.close();
    } finally {
      if (prevStateEnv === undefined) delete process.env.WARDEN_STATE_FILE;
      else process.env.WARDEN_STATE_FILE = prevStateEnv;
    }
  }, 30000);

  it("tears itself down when the agent disconnects (no orphan)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "warden-d-"));
    const dbPath = path.join(dir, "audit.db").replace(/\\/g, "/");
    const configPath = writeConfig(dir, dbPath);

    const prevStateEnv = process.env.WARDEN_STATE_FILE;
    process.env.WARDEN_STATE_FILE = path.join(dir, "state.json");
    try {
      const [clientT, serverT] = InMemoryTransport.createLinkedPair();
      let frontendClosed = false;
      const running = await startGateway(configPath, serverT, () => {
        frontendClosed = true;
      });
      const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
      await client.connect(clientT);

      // dashboard is up before disconnect
      const health = await fetch(`http://127.0.0.1:${running.dashboardPort}/api/health`);
      expect((await health.json()).ok).toBe(true);

      // agent disconnects → warden should tear itself down and fire the exit hook
      await client.close();
      await vi.waitFor(() => expect(frontendClosed).toBe(true), { timeout: 5000, interval: 50 });

      // dashboard port is now closed (auto-teardown ran); calling close() again is a no-op
      await expect(
        fetch(`http://127.0.0.1:${running.dashboardPort}/api/health`),
      ).rejects.toThrow();
      await running.close(); // idempotent
    } finally {
      if (prevStateEnv === undefined) delete process.env.WARDEN_STATE_FILE;
      else process.env.WARDEN_STATE_FILE = prevStateEnv;
    }
  }, 30000);
});

describe("watchPolicies", () => {
  it("reloads valid changes and keeps last-good on invalid", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "warden-w-"));
    const configPath = path.join(dir, "warden.yaml");
    writeFileSync(configPath, "policies: []\n");
    const live = loadConfig(configPath);
    const warnings: string[] = [];
    const stop = watchPolicies(configPath, live, (m) => warnings.push(m));

    writeFileSync(configPath, `policies:\n  - match: { tool: "x" }\n    action: deny\n`);
    await vi.waitFor(() => expect(live.policies).toHaveLength(1), { timeout: 5000, interval: 100 });

    writeFileSync(configPath, "policies:\n  - action: not-an-action\n");
    await vi.waitFor(() => expect(warnings.length).toBeGreaterThan(0), { timeout: 5000, interval: 100 });
    expect(live.policies).toHaveLength(1); // last-good kept

    stop();
  }, 15000);
});
