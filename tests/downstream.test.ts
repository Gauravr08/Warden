import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import { DownstreamManager } from "../src/downstream/manager.js";

const fixture = path.resolve("tests/fixtures/echo-server.mjs");
const servers = { echo: { command: process.execPath, args: [fixture], env: {} } };

describe("DownstreamManager", () => {
  it("starts, lists tools, calls tools, stops", async () => {
    const mgr = new DownstreamManager(servers);
    await mgr.start();
    expect(mgr.state("echo")).toBe("running");
    const tools = await mgr.listTools("echo");
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["echo", "danger", "crash"]));
    const res = await mgr.callTool("echo", "echo", { message: "hi there" });
    expect(JSON.stringify(res)).toContain("hi there");
    await mgr.stop();
    expect(mgr.state("echo")).toBe("stopped");
  });

  it("restarts after crash and serves calls again", async () => {
    const mgr = new DownstreamManager(servers);
    await mgr.start();
    await mgr.callTool("echo", "crash", {}).catch(() => {});
    await vi.waitFor(() => expect(mgr.state("echo")).toBe("running"), { timeout: 10000, interval: 100 });
    const res = await mgr.callTool("echo", "echo", { message: "back" });
    expect(JSON.stringify(res)).toContain("back");
    await mgr.stop();
  }, 20000);

  it("marks unstartable server degraded without failing start()", async () => {
    const mgr = new DownstreamManager({ bad: { command: process.execPath, args: ["no-such-file.mjs"], env: {} } });
    await mgr.start();
    await vi.waitFor(() => expect(mgr.state("bad")).toBe("degraded"), { timeout: 10000, interval: 100 });
    await mgr.stop();
  }, 15000);
});
