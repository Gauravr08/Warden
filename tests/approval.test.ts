import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApprovalManager } from "../src/approval/manager.js";

const input = { server: "gh", tool: "del", args: {}, flags: [], phase: "call" as const };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ApprovalManager", () => {
  it("resolves approved on user approve", async () => {
    const m = new ApprovalManager(120000);
    const p = m.request(input);
    const id = m.list()[0].id;
    expect(m.resolve(id, "approve")).toBe(true);
    await expect(p).resolves.toMatchObject({ approved: true, actor: "user" });
    expect(m.list()).toHaveLength(0);
  });

  it("always_allow carries the always marker", async () => {
    const m = new ApprovalManager(120000);
    const p = m.request(input);
    m.resolve(m.list()[0].id, "always_allow");
    await expect(p).resolves.toMatchObject({ approved: true, always: "allow" });
  });

  it("times out to deny", async () => {
    const m = new ApprovalManager(1000);
    const p = m.request(input);
    vi.advanceTimersByTime(1001);
    await expect(p).resolves.toMatchObject({ approved: false, actor: "timeout" });
    expect(m.list()).toHaveLength(0);
  });

  it("emits pending and resolved events; resolve on unknown id is false", () => {
    const m = new ApprovalManager(1000);
    const events: string[] = [];
    m.on("pending", () => events.push("pending"));
    m.on("resolved", () => events.push("resolved"));
    void m.request(input);
    m.resolve(m.list()[0].id, "deny");
    expect(events).toEqual(["pending", "resolved"]);
    expect(m.resolve("nope", "approve")).toBe(false);
  });
});
