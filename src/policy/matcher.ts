import picomatch from "picomatch";
import { expandHome } from "../config/load.js";
import { CASE_INSENSITIVE_FS, isAbsolutePathLike, normalizePath } from "../paths.js";

export function globMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  return picomatch.isMatch(value, pattern, { dot: true });
}

function normalizePathlike(s: string): string {
  return expandHome(s).replace(/\\/g, "/");
}

function getPath(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const key of dotted.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function argsMatch(
  pattern: Record<string, unknown>,
  args: Record<string, unknown>,
  opts: { caseInsensitive?: boolean } = {},
): boolean {
  const caseInsensitive = opts.caseInsensitive ?? CASE_INSENSITIVE_FS;
  for (const [key, expected] of Object.entries(pattern)) {
    const actual = getPath(args, key);
    if (typeof expected === "string" && typeof actual === "string") {
      const value = normalizePath(actual, false);
      const nocase = caseInsensitive && isAbsolutePathLike(value);
      if (expected === "*") continue;
      if (!picomatch.isMatch(value, normalizePathlike(expected), { dot: true, nocase })) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}
