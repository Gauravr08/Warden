# Spec — make `warden simulate` accurate

Status: approved for implementation.

## Problem

`warden simulate` (src/simulate.ts) replays audit rows against a proposed policy
and compares `r.decision` (what was recorded) with `redecide()` (what the
proposed policy says). But `r.decision` is the **final outcome**, not the
**policy's verdict**. The gateway (src/gateway.ts `pipeline`) overwrites the
policy verdict in three places before recording:

1. **Human approval.** Policy said `approve`; the user clicked approve → recorded
   `decision: "allow", reason: "approved by user"`; user denied / timeout →
   `decision: "deny", reason: "denied by user" | "user did not approve"`.
   Replaying under the *same* policy yields `approve` → reported as a change. **False positive.**
2. **Rate limit.** Policy said `allow`; limit hit → recorded `deny, "rate limit exceeded"`.
   Replay yields `allow` → reported as "now ALLOWED". **False positive.**
3. **Result-phase approval.** Call allowed, result flagged, `evaluateResultPhase` said
   `approve`, user approved → recorded `allow` with the *call-phase* reason and a
   non-null `approvalActor`. Replay yields `approve` → false positive.

Also: rows with `unknown tool …` or `internal error (…)` never reached policy;
they must not be compared at all.

Secondary: args are redacted (`[REDACTED:<flag>]`) before storage, so rules with
`match.args` patterns may not replay exactly for those rows. We cannot fix that,
but must be honest about it.

**Acceptance test of the whole fix:** replaying any audit history against the
*unchanged* policy that produced it must report **0 changes** (rate limits and
human clicks notwithstanding).

## Design

### 1. Record the policy verdict going forward (new column)

- `AuditRecord` gains `policyDecision: string | null` — the policy-level verdict
  (`"allow" | "deny" | "approve"`) after base evaluate → args-phase escalation →
  result-phase escalation, **before** rate limiting and **before** human input.
  `null` when policy was never consulted (unknown tool, internal error).
- SQLite: new nullable column `policy_decision TEXT`. Add it in `SCHEMA` and in
  `migrate()` (same pattern as the existing `reason` migration). Map it in
  `Row`/`toRecord`/`insert`.
- Gateway: track a local `policyDecision` in `pipeline`:
  - after base + args-phase escalation: `policyDecision = decision.action`
    (captured BEFORE the rate-limit check and BEFORE the approval branch);
  - in the result phase, if `rdec.action` is `deny` or `approve`, set
    `policyDecision = rdec.action` (mirrors `redecide` in simulate.ts);
  - pass it to every `record(...)` call; `null` for unknown-tool and the
    catch-all internal-error path. Add `policyDecision` to `RecordInput`.
  - Do NOT change any user-visible behavior, messages, or `decision` values.

### 2. Infer the verdict for legacy rows (no column value)

In `simulate.ts`, add an exported pure function
`historicalPolicyDecision(r: AuditRecord): "allow" | "deny" | "approve" | null`:

1. if `r.policyDecision` is non-null → return it;
2. reason starts with `unknown tool` or `internal error` → `null`;
3. reason is `approved by user`, `denied by user`, or `user did not approve` → `approve`;
4. reason starts with `flagged result not approved` → `approve`;
5. reason is `rate limit exceeded` → `allow`;
6. `r.decision === "allow"` and `r.approvalActor !== null` → `approve` (result-phase approval);
7. otherwise → `r.decision`.

### 3. Simulate compares verdict to verdict

- `simulate()` uses `historicalPolicyDecision(r)` as `from`. If it is `null`,
  count the row in a new `skipped` counter and do not compare.
- Category semantics (by `to`): `nowDenied` = to `deny`; `nowAllowed` = to `allow`;
  `nowPrompt` = to `approve`. `from` may now be `approve`.
- New counter `approximate`: number of **compared** rows whose `argsJson`
  contains `[REDACTED:` while the proposed config has at least one policy rule
  with a `match.args` condition.
- `SimResult` gains `skipped: number` and `approximate: number`. `total` stays
  the number of rows given.
- `formatSimulation` updates:
  - `now DENIED:        N   (were allowed or asked before)`
  - `now ALLOWED:       N   (were denied or asked before)`
  - `now need APPROVAL: N   (were allowed or denied before)`
  - if `skipped > 0`: line `  skipped:           N   (never reached policy: unknown tool / internal error)`
  - if `approximate > 0`: a note after the counts:
    `Note: N replayed calls had redacted arguments; rules matching on args may be approximate.`
  - Changed-decision lines keep the current shape (`from -> TO  server/tool — reason [rule #i]`).
- Keep the "No decisions would change. Safe to apply." line when there are no changes.

## Tests (TDD — write failing tests first)

`tests/simulate.test.ts` — add:
- approved-by-user row (decision allow, approvalActor "user", reason "approved by user",
  policyDecision null) under a policy whose default is `approve` → unchanged.
- denied-by-user and timeout rows → unchanged under same `approve` policy.
- rate-limited row (decision deny, reason "rate limit exceeded") under an allow policy → unchanged.
- result-phase approved row (decision allow, approvalActor "user", flags [injection:…])
  under a policy with `result_has_injection` → approve rule → unchanged.
- `policyDecision` column takes precedence over inference.
- unknown-tool / internal-error rows → `skipped`, not in changes.
- an `approve`→`deny` change is counted in `nowDenied` with `from: "approve"`.
- `approximate` counts redacted rows only when an args rule exists.
- formatSimulation prints the skipped line and the approximate note only when > 0.
- Existing tests must keep passing (update the `rec()` helper to include `policyDecision: null`).

`tests/audit.test.ts` — round-trips `policyDecision`; migration adds
`policy_decision` to a db created without it (mirror the existing reason-migration test).

`tests/gateway.test.ts` — add assertions that the recorded `policyDecision` is:
`approve` for the user-approved flow, `allow` for a rate-limited call, `null` for an
unknown tool, and that `decision` values/messages are unchanged.

**End-to-end acceptance test** (in `tests/gateway.test.ts` or a new
`tests/simulate-roundtrip.test.ts`): drive a Gateway (reuse the existing gateway
test harness/fakes) through allow, deny, approve-then-approved, approve-then-denied,
and rate-limited calls; then `simulate(sameConfig, audit.query())` must give
`changes.length === 0`.

## Out of scope
Do not touch README.md / ARCHITECTURE.md (handled separately). No new CLI flags.
Do not commit; leave changes in the working tree for review.

## Done when
`npm test` passes, `npx tsc -p tsconfig.json --noEmit` is clean, and the
round-trip acceptance test passes.
