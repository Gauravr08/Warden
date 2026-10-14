import { CASE_INSENSITIVE_FS, looksLikeAbsolutePath, normalizePath } from "../paths.js";

export const SECRET_PATTERNS: Array<{ flag: string; re: RegExp }> = [
  { flag: "secret:aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { flag: "secret:github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,255}\b/ },
  { flag: "secret:private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { flag: "secret:jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { flag: "secret:slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function walkStrings(value: unknown, visit: (s: string) => void): void {
  if (typeof value === "string") visit(value);
  else if (Array.isArray(value)) value.forEach((v) => walkStrings(v, visit));
  else if (value !== null && typeof value === "object")
    Object.values(value).forEach((v) => walkStrings(v, visit));
}

function inside(p: string, root: string): boolean {
  return p === root || p.startsWith(root.endsWith("/") ? root : root + "/");
}

export function scanArgs(
  args: unknown,
  opts: { allowedRoots?: string[]; caseInsensitive?: boolean } = {},
): string[] {
  const flags = new Set<string>();
  let text: string;
  try {
    text = JSON.stringify(args) ?? "";
  } catch {
    return ["secret:unserializable"];
  }
  for (const { flag, re } of SECRET_PATTERNS) if (re.test(text)) flags.add(flag);

  const alreadySecret = flags.size > 0;
  for (const token of text.match(/[A-Za-z0-9+/=_-]{32,}/g) ?? []) {
    if (!alreadySecret && shannonEntropy(token) > 4.5) {
      flags.add("secret:high-entropy");
      break;
    }
  }

  const ci = opts.caseInsensitive ?? CASE_INSENSITIVE_FS;
  const roots = opts.allowedRoots?.map((r) => normalizePath(r, ci));
  if (roots && roots.length > 0) {
    walkStrings(args, (s) => {
      if (looksLikeAbsolutePath(s) && !roots.some((r) => inside(normalizePath(s, ci), r))) {
        flags.add("path:outside-roots");
      }
    });
  }
  return [...flags];
}
