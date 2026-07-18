import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { stringify } from "yaml";

export interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ClientConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [k: string]: unknown;
}

export type ClientKind = "claude-desktop" | "claude-code" | "cursor";

export function defaultClientConfigPath(client: ClientKind): string {
  const home = homedir();
  switch (client) {
    case "claude-desktop":
      if (platform() === "win32")
        return path.join(
          process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
          "Claude",
          "claude_desktop_config.json",
        );
      if (platform() === "darwin")
        return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
      return path.join(home, ".config", "Claude", "claude_desktop_config.json");
    case "claude-code":
      return path.join(home, ".claude.json");
    case "cursor":
      return path.join(home, ".cursor", "mcp.json");
  }
}

export function buildWardenYaml(client: ClientConfig): string {
  const servers: Record<string, Required<McpServerEntry>> = {};
  for (const [name, s] of Object.entries(client.mcpServers ?? {})) {
    if (name === "warden") continue;
    servers[name] = { command: s.command, args: s.args ?? [], env: s.env ?? {} };
  }
  return stringify({
    servers,
    defaults: { action: "approve" },
    policies: [],
    limits: [],
  });
}

export function swapToWarden(client: ClientConfig, wardenConfigPath: string): ClientConfig {
  return {
    ...client,
    mcpServers: {
      warden: { command: "npx", args: ["-y", "warden", "start", "--config", wardenConfigPath] },
    },
  };
}

export function runImport(opts: { client: ClientKind; file?: string; out: string; apply: boolean }): void {
  const clientPath = opts.file ?? defaultClientConfigPath(opts.client);
  if (!existsSync(clientPath)) {
    console.error(`[warden] client config not found: ${clientPath}`);
    process.exitCode = 1;
    return;
  }
  const clientCfg = JSON.parse(readFileSync(clientPath, "utf8")) as ClientConfig;
  writeFileSync(opts.out, buildWardenYaml(clientCfg));
  const count = Object.keys(clientCfg.mcpServers ?? {}).length;
  console.error(`[warden] wrote ${opts.out} (${count} servers)`);
  if (opts.apply) {
    const backup = `${clientPath}.warden-backup-${Date.now()}`;
    copyFileSync(clientPath, backup);
    writeFileSync(clientPath, JSON.stringify(swapToWarden(clientCfg, path.resolve(opts.out)), null, 2));
    console.error(`[warden] swapped ${clientPath} -> warden (backup: ${backup})`);
  } else {
    console.error("[warden] dry run — pass --apply to swap the client config (a timestamped backup is made)");
  }
}
