import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe.skipIf(!process.env.E2E)("e2e smoke", () => {
  it("real gateway process: list, allow, deny, export", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "warden-e2e-"));
    const fixture = path.resolve("tests/fixtures/echo-server.mjs").replace(/\\/g, "/");
    const dbPath = path.join(dir, "audit.db").replace(/\\/g, "/");
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

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve("dist/cli/index.js"), "start", "--config", configPath],
    });
    const client = new Client({ name: "e2e", version: "0" }, { capabilities: {} });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["echo", "danger", "crash"]),
    );

    const ok = await client.callTool({ name: "echo", arguments: { message: "e2e says hi" } });
    expect(JSON.stringify(ok)).toContain("e2e says hi");

    const blocked = await client.callTool({ name: "danger", arguments: { target: "prod" } });
    expect(JSON.stringify(blocked)).toContain("Blocked by warden");

    await client.close();

    const jsonl = execFileSync(
      process.execPath,
      [path.resolve("dist/cli/index.js"), "export", "--config", configPath],
      { encoding: "utf8" },
    );
    const rows = jsonl.trim().split("\n").map((l) => JSON.parse(l));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.decision).sort()).toEqual(["allow", "deny"]);
  }, 60000);
});
