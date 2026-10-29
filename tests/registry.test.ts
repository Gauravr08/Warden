import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../src/registry.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const tool = (name: string, description?: string): Tool => ({
  name,
  inputSchema: { type: "object" },
  ...(description && { description })
});

describe("ToolRegistry", () => {
  it("keeps original names when unique, prefixes all on collision", () => {
    const reg = new ToolRegistry();
    reg.refresh(new Map([
      ["github", [tool("get_issue"), tool("search")]],
      ["slack", [tool("post_message"), tool("search")]],
    ]));
    const names = reg.list().map((t) => t.name).sort();
    expect(names).toEqual(["get_issue", "github__search", "post_message", "slack__search"]);
    expect(reg.resolve("get_issue")).toEqual({ server: "github", tool: "get_issue" });
    expect(reg.resolve("slack__search")).toEqual({ server: "slack", tool: "search" });
    expect(reg.resolve("search")).toBeUndefined();
    expect(reg.resolve("nope")).toBeUndefined();
  });

  it("refresh replaces previous state", () => {
    const reg = new ToolRegistry();
    reg.refresh(new Map([["a", [tool("x")]]]));
    reg.refresh(new Map([["b", [tool("y")]]]));
    expect(reg.list().map((t) => t.name)).toEqual(["y"]);
    expect(reg.resolve("x")).toBeUndefined();
  });

  it("keeps first and drops duplicate when one server repeats a tool name", () => {
    const reg = new ToolRegistry();
    reg.refresh(new Map([["github", [tool("x", "first"), tool("x", "second")]]]));
    const xs = reg.list().filter((t) => t.name === "github__x");
    expect(xs).toHaveLength(1);
    expect(xs[0].description).toBe("first");
  });
});
