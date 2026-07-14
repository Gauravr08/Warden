const INJECTION_PATTERNS: Array<{ flag: string; re: RegExp }> = [
  {
    flag: "injection:override-phrase",
    re: /ignore (all |any )?(previous|prior|above) (instructions|messages|prompts)|disregard (your|all|previous) (instructions|rules)|you are now\b|new instructions:/i,
  },
  { flag: "injection:system-prompt", re: /<\s*system\s*>|\[\s*system\s*\]|^\s*system\s*:/im },
  { flag: "injection:hidden-marker", re: /<!--[\s\S]{0,500}?(instruction|do not tell|secretly|hidden)[\s\S]{0,500}?-->/i },
  { flag: "injection:zero-width", re: /[\u200b\u200c\u200d\u2060\ufeff]/ },
  { flag: "injection:base64-blob", re: /[A-Za-z0-9+/]{200,}={0,2}/ },
  { flag: "injection:ansi-escape", re: /\\u001b\[/i },
];

export function scanResult(result: unknown): string[] {
  const text = JSON.stringify(result) ?? "";
  const flags: string[] = [];
  for (const { flag, re } of INJECTION_PATTERNS) if (re.test(text)) flags.push(flag);
  return flags;
}
