import { readFileSync, writeFileSync } from "node:fs";
import { isSeq, parseDocument } from "yaml";
import type { PolicyRule } from "../config/schema.js";

export function appendPolicyRule(configPath: string, rule: PolicyRule): void {
  const doc = parseDocument(readFileSync(configPath, "utf8"));
  const existing = doc.get("policies");
  if (isSeq(existing)) {
    existing.add(doc.createNode(rule));
  } else {
    doc.set("policies", doc.createNode([rule]));
  }
  writeFileSync(configPath, doc.toString());
}
