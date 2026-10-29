import { isMap, isSeq, parseDocument, type Document } from "yaml";
import { ConfigError, parseConfigText } from "../config/load.js";
import { ActionSchema, LimitRuleSchema, PolicyRuleSchema } from "../config/schema.js";
import { z } from "zod";

export const EditableRulesSchema = z.object({
  defaults: z.object({ action: ActionSchema }),
  policies: z.array(PolicyRuleSchema),
  limits: z.array(LimitRuleSchema),
  allowed_roots: z.array(z.string()),
});
export type EditableRules = z.infer<typeof EditableRulesSchema>;

export function parseRules(input: unknown): EditableRules {
  const r = EditableRulesSchema.safeParse(input);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new ConfigError(`Invalid rules:\n${issues}`);
  }
  return r.data;
}

export function rulesFromText(text: string): EditableRules {
  const cfg = parseConfigText(text, "warden.yaml");
  return {
    defaults: { action: cfg.defaults.action },
    policies: cfg.policies,
    limits: cfg.limits,
    allowed_roots: cfg.scanner.allowed_roots ?? [],
  };
}

export function applyRulesToText(currentText: string, input: unknown): string {
  const rules = parseRules(input);
  const doc = parseDocument(currentText);
  if (doc.errors.length) throw new ConfigError(`YAML error in warden.yaml: ${doc.errors[0].message}`);
  if (isMap(doc.get("defaults", true))) doc.setIn(["defaults", "action"], rules.defaults.action);
  else doc.set("defaults", { action: rules.defaults.action });
  doc.set("policies", flowMatches(doc, rules.policies));
  if (rules.limits.length) doc.set("limits", flowMatches(doc, rules.limits));
  else doc.delete("limits");
  if (rules.allowed_roots.length) doc.setIn(["scanner", "allowed_roots"], rules.allowed_roots);
  else {
    doc.deleteIn(["scanner", "allowed_roots"]);
    const sc = doc.get("scanner", true);
    if (isMap(sc) && sc.items.length === 0) doc.delete("scanner");
  }
  // The yaml lib normalizes flow collections; follow the file's existing style.
  const bare = currentText.replace(/[$][{]/g, "");
  const padded = (bare.match(/[[{] \S/g) ?? []).length;
  const tight = (bare.match(/[[{][^\s\]}[{]/g) ?? []).length;
  const out = doc.toString({ flowCollectionPadding: padded >= tight, lineWidth: 0 });
  parseConfigText(out, "warden.yaml");
  return out;
}

// Keep each rule's match on one line, like hand-written configs: "- match: { tool: echo }".
function flowMatches(doc: Document, rules: unknown[]): unknown {
  const node = doc.createNode(rules);
  if (isSeq(node)) {
    for (const item of node.items) {
      const m = isMap(item) ? item.get("match", true) : undefined;
      if (isMap(m)) m.flow = true;
    }
  }
  return node;
}
