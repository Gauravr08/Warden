import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { globMatch, argsMatch } from "../src/policy/matcher.js";

describe("globMatch", () => {
  it.each([
    ["*", "anything", true],
    ["get_*", "get_issue", true],
    ["get_*", "create_issue", false],
    ["delete_*", "delete_repo", true],
    ["read_file", "read_file", true],
  ])("pattern %s vs %s -> %s", (p, v, want) => {
    expect(globMatch(p, v)).toBe(want);
  });
});

describe("argsMatch", () => {
  it("glob-matches string values with home expansion and slash normalization", () => {
    const home = homedir().replace(/\\/g, "/");
    expect(argsMatch({ path: "~/projects/**" }, { path: `${home}/projects/a/b.txt` })).toBe(true);
    expect(argsMatch({ path: "~/projects/**" }, { path: "/etc/passwd" })).toBe(false);
  });

  it("matches dot-path keys and exact non-strings", () => {
    expect(argsMatch({ "opts.force": true }, { opts: { force: true } })).toBe(true);
    expect(argsMatch({ "opts.force": true }, { opts: { force: false } })).toBe(false);
    expect(argsMatch({ "opts.force": true }, {})).toBe(false);
  });

  it("bare * matches any string value including multi-segment paths", () => {
    expect(argsMatch({ path: "*" }, { path: "/a/b/c.txt" })).toBe(true);
    expect(argsMatch({ path: "*" }, { path: "C:\\x\\y.txt" })).toBe(true);
  });

  it("matches paths case-insensitively only when caseInsensitive", () => {
    const p = { path: "C:/users/asus/x/**" };
    const a = { path: "C:/Users/ASUS/x/a.txt" };
    expect(argsMatch(p, a, { caseInsensitive: true })).toBe(true);
    expect(argsMatch(p, a, { caseInsensitive: false })).toBe(false);
  });

  it("keeps non-path strings case-sensitive even when caseInsensitive", () => {
    expect(argsMatch({ name: "foo*" }, { name: "FOO bar" }, { caseInsensitive: true })).toBe(false);
    expect(argsMatch({ name: "foo*" }, { name: "foo bar" }, { caseInsensitive: true })).toBe(true);
  });

  it("resolves .. before matching so deny rules can't be bypassed", () => {
    const a = { path: "C:/s/allowed/../private/k.txt" };
    expect(argsMatch({ path: "C:/s/private/**" }, a, { caseInsensitive: false })).toBe(true);
    expect(argsMatch({ path: "C:/s/allowed/**" }, a, { caseInsensitive: false })).toBe(false);
  });

  it("deny-style pattern matches mixed case + dot-dot together", () => {
    expect(
      argsMatch({ path: "C:/s/private/**" }, { path: "C:/S/allowed/../PRIVATE/k" }, { caseInsensitive: true }),
    ).toBe(true);
  });
});
