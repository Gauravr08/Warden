import { EventEmitter } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ToolListChangedNotificationSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { ServerConfig } from "../config/schema.js";

export type ServerState = "starting" | "running" | "degraded" | "stopped";

const MAX_RESTARTS = 3;

export class DownstreamManager extends EventEmitter {
  private clients = new Map<string, Client>();
  private states = new Map<string, ServerState>();
  private restartCounts = new Map<string, number>();
  private stopping = false;

  constructor(private servers: Record<string, ServerConfig>) {
    super();
  }

  serverNames(): string[] {
    return Object.keys(this.servers);
  }

  state(name: string): ServerState {
    return this.states.get(name) ?? "stopped";
  }

  async start(): Promise<void> {
    this.stopping = false;
    await Promise.all(
      this.serverNames().map(async (name) => {
        this.restartCounts.set(name, 0);
        try {
          await this.startOne(name);
        } catch (e) {
          console.error(`[warden] failed to start ${name}: ${(e as Error).message}`);
          this.setState(name, "degraded");
        }
      }),
    );
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await Promise.all([...this.clients.values()].map((c) => c.close().catch(() => {})));
    this.clients.clear();
    for (const n of this.serverNames()) this.setState(n, "stopped");
  }

  async listTools(name: string): Promise<Tool[]> {
    const client = this.clients.get(name);
    if (!client || this.state(name) !== "running") return [];
    return (await client.listTools()).tools;
  }

  async callTool(name: string, tool: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const client = this.clients.get(name);
    if (!client || this.state(name) !== "running") {
      throw new Error(`downstream server "${name}" is ${this.state(name)}`);
    }
    return (await client.callTool({ name: tool, arguments: args })) as CallToolResult;
  }

  private setState(name: string, state: ServerState): void {
    this.states.set(name, state);
    this.emit("stateChanged", { server: name, state });
  }

  private async startOne(name: string): Promise<void> {
    const cfg = this.servers[name];
    this.setState(name, "starting");
    const transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: { ...(process.env as Record<string, string>), ...cfg.env },
    });
    const client = new Client({ name: "warden", version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    client.onclose = () => {
      void this.handleExit(name);
    };
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      this.emit("toolsChanged", name);
    });
    this.clients.set(name, client);
    this.setState(name, "running");
    this.emit("toolsChanged", name);
  }

  private async handleExit(name: string): Promise<void> {
    if (this.stopping) return;
    this.clients.delete(name);
    const count = (this.restartCounts.get(name) ?? 0) + 1;
    this.restartCounts.set(name, count);
    if (count > MAX_RESTARTS) {
      this.setState(name, "degraded");
      console.error(`[warden] ${name} degraded after ${MAX_RESTARTS} restarts`);
      return;
    }
    this.setState(name, "starting");
    await new Promise((r) => setTimeout(r, 250 * 2 ** (count - 1)));
    if (this.stopping) return;
    try {
      await this.startOne(name);
    } catch (e) {
      console.error(`[warden] restart of ${name} failed: ${(e as Error).message}`);
      this.setState(name, "degraded");
    }
  }
}
