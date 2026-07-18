export type ClientKind = "claude-desktop" | "claude-code" | "cursor";
export function runImport(_opts: { client: ClientKind; file?: string; out: string; apply: boolean }): void {
  console.error("[warden] import is not implemented yet");
  process.exitCode = 1;
}
