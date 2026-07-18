// Live demo driver. Pretends to be an AI agent making tool calls THROUGH warden.
// It spawns the real built warden gateway, which spawns the echo server behind it.
// Watch the dashboard (URL is printed below) while this runs.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = (s) => console.log("\n" + s);

// Spawn warden (the gateway). Warden prints its dashboard URL to stderr.
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/cli/index.js", "start", "--config", "demo/warden.yaml"],
  stderr: "inherit", // so you SEE warden's "[warden] dashboard: http://..." line
});

const client = new Client({ name: "demo-agent", version: "0" }, { capabilities: {} });
await client.connect(transport);

await sleep(800);
line("=== 1. The agent asks warden what tools exist ===");
const tools = await client.listTools();
console.log("   tools warden exposes:", tools.tools.map((t) => t.name).join(", "));

await sleep(1500);
line("=== 2. A normal, safe call: echo. Policy has no rule -> default is 'approve'. ===");
line("    >>> GO TO THE DASHBOARD and click 'Approve once' (or 'Deny'). Waiting... <<<");
try {
  const r = await client.callTool({ name: "echo", arguments: { message: "hello from the agent" } });
  console.log("   result:", JSON.stringify(r.content));
} catch (e) {
  console.log("   call ended:", e.message);
}

await sleep(1500);
line("=== 3. A blocked tool: danger. Policy says deny. No prompt, instant block. ===");
const d = await client.callTool({ name: "danger", arguments: { target: "production-db" } });
console.log("   result:", JSON.stringify(d.content), " isError:", d.isError);

await sleep(1500);
line("=== 4. A call carrying a secret (AWS key) in its args. Secret-deny wins. ===");
const s = await client.callTool({ name: "echo", arguments: { note: "key is AKIAIOSFODNN7EXAMPLE" } });
console.log("   result:", JSON.stringify(s.content), " isError:", s.isError);

await sleep(1000);
line("=== Done. Every call above is now in the audit log (see the dashboard table). ===");
line("Press Ctrl+C to stop. (The dashboard stays up until you do.)");

// keep alive so you can keep looking at the dashboard
await new Promise(() => {});
