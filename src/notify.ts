import notifier from "node-notifier";

export function notifyPending(p: { server: string; tool: string; phase: string }): void {
  try {
    notifier.notify({
      title: "Warden: approval needed",
      message: `${p.server} / ${p.tool}${p.phase === "result" ? " (flagged result)" : ""}`,
      wait: false,
    });
  } catch {
    // best-effort; never let a toast failure affect the gateway
  }
}
