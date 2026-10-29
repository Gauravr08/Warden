import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWardenYaml, swapToWarden, runImport } from "../src/cli/import.js";
import { loadConfig } from "../src/config/load.js";

const clientCfg = {
  theme: "dark",
  mcpServers: {
    github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { T: "x" } },
    fs: { command: "node", args: ["fs.js"] },
  },
};

describe("buildWardenYaml", () => {
  it("converts mcpServers and sets safe defaults", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "warden-i-"));
    const out = path.join(dir, "warden.yaml");
    writeFileSync(out, buildWardenYaml(clientCfg));
    const cfg = loadConfig(out);
    expect(Object.keys(cfg.servers)).toEqual(["github", "fs"]);
    expect(cfg.servers.github.env.T).toBe("x");
    expect(cfg.servers.fs.args).toEqual(["fs.js"]);
    expect(cfg.defaults.action).toBe("approve");
  });

  it("skips an entry literally named warden (idempotent re-import)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "warden-i3-"));
    const out = path.join(dir, "warden.yaml");
    const already = { mcpServers: {
      warden: { command: "npx", args: ["-y", "warden", "start", "--config", "/x/warden.yaml"] },
      github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
    }};
    writeFileSync(out, buildWardenYaml(already));
    const cfg = loadConfig(out);
    expect(cfg.servers.warden).toBeUndefined();     // warden NOT nested inside itself
    expect(cfg.servers.github).toBeDefined();        // real servers still migrated
  });
});

describe("swapToWarden", () => {
  it("replaces mcpServers with single warden entry, keeps other keys", () => {
    const swapped = swapToWarden(clientCfg, "/abs/warden.yaml");
    expect(Object.keys(swapped.mcpServers!)).toEqual(["warden"]);
    expect(swapped.mcpServers!.warden.args).toContain("/abs/warden.yaml");
    expect((swapped as Record<string, unknown>).theme).toBe("dark");
  });
});

describe("runImport --apply", () => {
  it("writes yaml, backs up, swaps client config", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "warden-i2-"));
    const clientPath = path.join(dir, "claude_desktop_config.json");
    writeFileSync(clientPath, JSON.stringify(clientCfg));
    const out = path.join(dir, "warden.yaml");
    runImport({ client: "claude-desktop", file: clientPath, out, apply: true });
    expect(loadConfig(out).servers.github).toBeDefined();
    const swapped = JSON.parse(readFileSync(clientPath, "utf8"));
    expect(Object.keys(swapped.mcpServers)).toEqual(["warden"]);
    expect(readdirSync(dir).some((f) => f.includes(".warden-backup-"))).toBe(true);
  });
});
