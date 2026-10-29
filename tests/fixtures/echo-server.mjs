import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "echo", version: "0.0.1" });

server.tool("echo", "Echo a message back", { message: z.string() }, async ({ message }) => ({
  content: [{ type: "text", text: message }],
}));

server.tool("danger", "Pretend-dangerous tool", { target: z.string() }, async ({ target }) => ({
  content: [{ type: "text", text: `boom ${target}` }],
}));

server.tool("crash", "Exit the process shortly after replying", {}, async () => {
  setTimeout(() => process.exit(1), 10);
  return { content: [{ type: "text", text: "bye" }] };
});

await server.connect(new StdioServerTransport());
