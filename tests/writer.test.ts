import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendPolicyRule } from "../src/policy/writer.js";
import { loadConfig } from "../src/config/load.js";

const setup = (yaml: string) => {
  const p = path.join(mkdtempSync(path.join(tmpdir(), "warden-w-")), "warden.yaml");
  writeFileSync(p, yaml);
  return p;
};

describe("appendPolicyRule", () => {
  it("appends to existing policies preserving comments", () => {
    const p = setup(`# my config
policies:
  - match: { server: gh, tool: "get_*" }  # readonly ok
    action: allow
`);
    appendPolicyRule(p, { match: { server: "gh", tool: "delete_repo" }, action: "deny" });
    const raw = readFileSync(p, "utf8");
    expect(raw).toContain("# my config");
    expect(raw).toContain("# readonly ok");
    const cfg = loadConfig(p);
    expect(cfg.policies).toHaveLength(2);
    expect(cfg.policies[1]).toEqual({ match: { server: "gh", tool: "delete_repo" }, action: "deny" });
  });

  it("creates policies list when absent", () => {
    const p = setup("servers: {}\n");
    appendPolicyRule(p, { match: { server: "x", tool: "y" }, action: "allow" });
    expect(loadConfig(p).policies).toHaveLength(1);
  });
});
