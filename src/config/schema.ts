import { z } from "zod";

export const ActionSchema = z.enum(["allow", "deny", "approve"]);
export type Action = z.infer<typeof ActionSchema>;

export const ServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const MatchSchema = z.object({
  server: z.string().optional(),
  tool: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  args_contain_secret: z.boolean().optional(),
  result_has_injection: z.boolean().optional(),
});
export type Match = z.infer<typeof MatchSchema>;

export const PolicyRuleSchema = z.object({
  match: MatchSchema,
  action: ActionSchema,
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const LimitRuleSchema = z.object({
  match: z.object({ server: z.string().optional(), tool: z.string().optional() }),
  max_calls_per_hour: z.number().int().positive(),
});
export type LimitRule = z.infer<typeof LimitRuleSchema>;

export const WardenConfigSchema = z.object({
  servers: z.record(z.string(), ServerConfigSchema).default({}),
  defaults: z.object({ action: ActionSchema }).default({ action: "approve" }),
  policies: z.array(PolicyRuleSchema).default([]),
  limits: z.array(LimitRuleSchema).default([]),
  scanner: z.object({ allowed_roots: z.array(z.string()).optional() }).default({}),
  approval_timeout_ms: z.number().int().positive().default(120000),
  dashboard: z.object({ port: z.number().int().default(9977) }).default({ port: 9977 }),
  audit: z
    .object({
      db_path: z.string().default("~/.warden/audit.db"),
      retention_days: z.number().int().positive().default(30),
    })
    .default({ db_path: "~/.warden/audit.db", retention_days: 30 }),
});
export type WardenConfig = z.infer<typeof WardenConfigSchema>;
