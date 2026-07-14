import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export interface PendingApproval {
  id: string;
  server: string;
  tool: string;
  args: Record<string, unknown>;
  flags: string[];
  createdTs: number;
  phase: "call" | "result";
}

export type ApprovalAction = "approve" | "deny" | "always_allow" | "always_deny";

export interface ApprovalOutcome {
  approved: boolean;
  actor: "user" | "timeout";
  always?: "allow" | "deny";
  waitedMs: number;
}

interface PendingEntry {
  record: PendingApproval;
  resolve: (outcome: ApprovalOutcome) => void;
  timer: NodeJS.Timeout;
}

export class ApprovalManager extends EventEmitter {
  private pending = new Map<string, PendingEntry>();

  constructor(private timeoutMs: number) {
    super();
  }

  request(input: Omit<PendingApproval, "id" | "createdTs">): Promise<ApprovalOutcome> {
    const record: PendingApproval = { ...input, id: randomUUID(), createdTs: Date.now() };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(record.id);
        this.emit("resolved", { id: record.id, approved: false });
        resolve({ approved: false, actor: "timeout", waitedMs: this.timeoutMs });
      }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(record.id, { record, resolve, timer });
      this.emit("pending", record);
    });
  }

  resolve(id: string, action: ApprovalAction): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    const approved = action === "approve" || action === "always_allow";
    const always = action === "always_allow" ? ("allow" as const)
      : action === "always_deny" ? ("deny" as const) : undefined;
    this.emit("resolved", { id, approved });
    entry.resolve({ approved, actor: "user", always, waitedMs: Date.now() - entry.record.createdTs });
    return true;
  }

  list(): PendingApproval[] {
    return [...this.pending.values()].map((e) => e.record);
  }
}
