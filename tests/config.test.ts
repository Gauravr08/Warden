import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { loadConfig, ConfigError, expandHome } from "../src/config/load.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "warden-")); });

const write = (yaml: string) => {
  const p = path.join(dir, "warden.yaml");
  writeFileSync(p, yaml);
  return p;
};

describe("loadConfig", () => {
  it("parses a full config and applies defaults", () => {
    process.env.TEST_TOKEN = "tok123";
    const cfg = loadConfig(write(`
servers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env: { GITHUB_TOKEN: "\${TEST_TOKEN}" }
policies:
  - match: { server: github, tool: "get_*" }
    action: allow
`));
    expect(cfg.servers.github.env.GITHUB_TOKEN).toBe("tok123");
    expect(cfg.defaults.action).toBe("approve");
    expect(cfg.approval_timeout_ms).toBe(120000);
    expect(cfg.dashboard.port).toBe(9977);
    expect(cfg.audit.retention_days).toBe(30);
    expect(cfg.audit.db_path).toBe(path.join(homedir(), ".warden/audit.db"));
    expect(cfg.policies).toHaveLength(1);
  });

  it("throws ConfigError on invalid YAML with location info", () => {
    expect(() => loadConfig(write("servers:\n  bad: [unclosed")))
      .toThrowError(ConfigError);
  });

  it("throws ConfigError on schema violation naming the path", () => {
    expect(() => loadConfig(write("policies:\n  - match: {}\n    action: explode")))
      .toThrowError(/policies.0.action/);
  });

  it("throws ConfigError on unset env var", () => {
    expect(() => loadConfig(write(`
servers:
  x: { command: node, env: { K: "\${WARDEN_NO_SUCH_VAR}" } }
`))).toThrowError(/WARDEN_NO_SUCH_VAR/);
  });
});

describe("expandHome", () => {
  it("expands ~/", () => {
    expect(expandHome("~/x")).toBe(path.join(homedir(), "x"));
    expect(expandHome("/abs/x")).toBe("/abs/x");
  });
});
