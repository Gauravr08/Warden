import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { WardenConfigSchema, type WardenConfig } from "./schema.js";

export class ConfigError extends Error {}

export function expandEnv(s: string): string {
  return s.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, name: string) => {
    const v = process.env[name];
    if (v === undefined) throw new ConfigError(`Environment variable not set: ${name}`);
    return v;
  });
}

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(homedir(), p.slice(2));
  return p;
}

export function loadConfig(configPath: string): WardenConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (e) {
    throw new ConfigError(`Cannot read config file ${configPath}: ${(e as Error).message}`);
  }
  let doc: unknown;
  try {
    doc = parse(raw); // yaml lib errors include line:col
  } catch (e) {
    throw new ConfigError(`YAML error in ${configPath}: ${(e as Error).message}`);
  }
  const parsed = WardenConfigSchema.safeParse(doc ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid config ${configPath}:\n${issues}`);
  }
  const cfg = parsed.data;
  for (const server of Object.values(cfg.servers)) {
    for (const [k, v] of Object.entries(server.env)) server.env[k] = expandEnv(v);
  }
  cfg.audit.db_path = expandHome(cfg.audit.db_path);
  return cfg;
}
