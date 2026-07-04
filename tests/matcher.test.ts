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
});
