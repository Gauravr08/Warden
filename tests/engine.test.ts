import { describe, it, expect } from "vitest";
import { evaluate, evaluateResultPhase, evaluateArgsPhase } from "../src/policy/engine.js";
import type { PolicyRule } from "../src/config/schema.js";

const policies: PolicyRule[] = [
  { match: { server: "github", tool: "get_*" }, action: "allow" },
  { match: { server: "github", tool: "delete_*" }, action: "deny" },
  { match: { tool: "*", args_contain_secret: true }, action: "deny" },
  { match: { server: "fs", result_has_injection: true }, action: "deny" },
];
const cfg = { policies, defaults: { action: "approve" as const } };
const input = (over: Partial<Parameters<typeof evaluate>[1]>) => ({
  server: "github", tool: "get_issue", args: {}, flags: [], ...over,
});

describe("evaluate", () => {
  it("first match wins", () => {
    expect(evaluate(cfg, input({}))).toMatchObject({ action: "allow", ruleIndex: 0 });
  });
  it("deny rule matches", () => {
    expect(evaluate(cfg, input({ tool: "delete_repo" }))).toMatchObject({ action: "deny", ruleIndex: 1 });
  });
  it("falls through to defaults", () => {
    expect(evaluate(cfg, input({ server: "slack", tool: "post" })))
      .toMatchObject({ action: "approve", ruleIndex: null });
  });
  it("secret flag condition matches secret: and path: flags", () => {
    expect(evaluate(cfg, input({ tool: "create_x", flags: ["secret:jwt"] }))).toMatchObject({ action: "deny", ruleIndex: 2 });
    expect(evaluate(cfg, input({ tool: "create_x", flags: ["path:outside-roots"] }))).toMatchObject({ action: "deny", ruleIndex: 2 });
  });
});

describe("evaluateResultPhase", () => {
  it("only result_has_injection rules apply", () => {
    // rule 0 (allow get_*) must NOT allow a tainted result through
    expect(evaluateResultPhase(cfg, input({ flags: ["injection:override-phrase"] })))
      .toMatchObject({ action: "approve", ruleIndex: null });
  });
  it("matching result rule wins", () => {
    expect(evaluateResultPhase(cfg, input({ server: "fs", tool: "read_file", flags: ["injection:zero-width"] })))
      .toMatchObject({ action: "deny", ruleIndex: 3 });
  });
});

describe("evaluateArgsPhase", () => {
  it("returns the matching secret rule decision", () => {
    expect(evaluateArgsPhase(cfg, input({ tool: "create_x", flags: ["secret:jwt"] })))
      .toMatchObject({ action: "deny", ruleIndex: 2 });
  });
  it("returns null when no args_contain_secret rule matches (no secret flags present)", () => {
    expect(evaluateArgsPhase(cfg, input({ tool: "create_x", flags: [] }))).toBeNull();
  });
  it("ignores rules without an args_contain_secret condition", () => {
    // rule 0 (echo/echo allow, no secret condition) must never be returned here
    expect(evaluateArgsPhase(cfg, input({ server: "github", tool: "get_issue", flags: [] }))).toBeNull();
  });
});
