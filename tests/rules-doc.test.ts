import { describe, it, expect } from "vitest";
import { applyRulesToText, rulesFromText } from "../src/policy/rules-doc.js";
import { ConfigError } from "../src/config/load.js";

const BASE = `servers:
  echo:
    # keep me
    command: node
    args: [ x.mjs ]
defaults: { action: deny }
policies:
  - match: { server: echo }
    action: allow
limits:
  - match: { tool: echo }
    max_calls_per_hour: 3
scanner:
  allowed_roots:
    - ~/projects
audit: { db_path: ":memory:" }
`;

describe("rules-doc", () => {
  it("reads the editable subset, keeping ~ raw", () => {
    expect(rulesFromText(BASE)).toEqual({
      defaults: { action: "deny" },
      policies: [{ match: { server: "echo" }, action: "allow" }],
      limits: [{ match: { tool: "echo" }, max_calls_per_hour: 3 }],
      allowed_roots: ["~/projects"],
    });
  });

  it("round-trips without touching servers or their comments", () => {
    const out = applyRulesToText(BASE, rulesFromText(BASE));
    expect(out).toContain("# keep me");
    expect(out).toContain("args: [ x.mjs ]");
    expect(out).toContain("~/projects");
    expect(rulesFromText(out)).toEqual(rulesFromText(BASE));
  });

  it("removes empty limits, allowed_roots and the empty scanner", () => {
    const rules = { ...rulesFromText(BASE), limits: [], allowed_roots: [] };
    const out = applyRulesToText(BASE, rules);
    expect(out).not.toContain("limits");
    expect(out).not.toContain("scanner");
    expect(out).toContain("# keep me");
    expect(rulesFromText(out).allowed_roots).toEqual([]);
  });

  it("keeps other scanner keys when clearing allowed_roots", () => {
    const text = "scanner:\n  allowed_roots: [/a]\n  extra: 1\n";
    const out = applyRulesToText(text, { defaults: { action: "approve" }, policies: [], limits: [], allowed_roots: [] });
    expect(out).toContain("scanner");
    expect(out).toContain("extra");
    expect(out).not.toContain("allowed_roots");
  });

  it("adds sections to a minimal file", () => {
    const out = applyRulesToText("", {
      defaults: { action: "allow" },
      policies: [{ match: { args_contain_secret: true }, action: "deny" }],
      limits: [],
      allowed_roots: ["/tmp/x"],
    });
    expect(rulesFromText(out).allowed_roots).toEqual(["/tmp/x"]);
    expect(rulesFromText(out).policies).toHaveLength(1);
  });

  it("rejects invalid rules", () => {
    expect(() => applyRulesToText(BASE, { defaults: { action: "nope" }, policies: [], limits: [], allowed_roots: [] }))
      .toThrow(ConfigError);
    expect(() => applyRulesToText(BASE, { ...rulesFromText(BASE), limits: [{ match: {}, max_calls_per_hour: 0 }] }))
      .toThrow(/max_calls_per_hour/);
    expect(() => applyRulesToText(BASE, null)).toThrow(ConfigError);
  });

  it("writes each rule's match on one line and never folds long values", () => {
    const long = "/very/long/path/" + "x".repeat(120);
    const out = applyRulesToText(BASE, {
      ...rulesFromText(BASE),
      policies: [{ match: { server: "fs", tool: "write_file", args: { path: long } }, action: "approve" }],
    });
    expect(out).toContain("- match: { server: fs, tool: write_file, args: { path: " + long + " } }");
  });
});
