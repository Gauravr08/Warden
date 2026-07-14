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

  it("does not restart a server if stop() is called during backoff", async () => {
    const mgr = new DownstreamManager(servers);
    await mgr.start();
    await mgr.callTool("echo", "crash", {}).catch(() => {});
    // Wait until handleExit has passed its initial `stopping` check and is
    // inside the backoff wait (state === "starting" for the restart attempt).
    // Calling stop() immediately after the crash call is not reliable timing:
    // stop()'s own client.close() tends to close the transport before the
    // child's self-triggered crash-exit reaches handleExit's first guard,
    // so the bug never gets exercised. Waiting for "starting" guarantees
    // we are inside the backoff window when stop() is called.
    await vi.waitFor(() => expect(mgr.state("echo")).toBe("starting"), { timeout: 5000, interval: 2 });
    // stop() while the crash backoff timer is pending
    await mgr.stop();
    // give any errant restart time to (incorrectly) fire
    await new Promise((r) => setTimeout(r, 1500));
    expect(mgr.state("echo")).toBe("stopped");
  }, 20000);
});
