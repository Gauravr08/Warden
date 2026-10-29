# Warden — v2 / follow-up backlog

Non-blocking items surfaced during the subagent-driven build and the final
whole-branch review. None block the v0.1 merge; each was triaged
OK-as-follow-up by the reviewers.

## Correctness / robustness
- **Downstream restart budget is lifetime-cumulative.** `DownstreamManager` never
  resets `restartCounts` on a healthy run, so a server that crashes, self-heals,
  and later crashes again 4× total over the process lifetime is marked `degraded`
  as if stuck in a crash loop. Needs a consecutive-failure / healthy-uptime window.
  Related: `stop()` → immediate `start()` with a stale backoff timer pending could
  double-spawn.
- **Result-phase `always_allow` is a near-no-op.** `persistAlways` writes an
  unconditional `{server, tool} allow` rule with no `result_has_injection`
  condition, which `evaluateResultPhase` skips — so the next flagged result from
  the same tool re-escalates to approval. Fails safe (re-prompts) but the button
  misleads. `always_deny` works (blocks at call phase). Fix: persist a
  `result_has_injection`-conditioned rule for result-phase always-decisions.
- **`startGateway` catch doesn't `gateway.server.close()`** if `transport.start()`
  itself throws (gateway is scoped inside the try). Narrow; process is exiting on
  that path anyway.
- **Rate-limit read-vs-write race.** `overLimit` reads the forwarded count before
  `record` writes `forwarded=1`; two concurrent calls can both pass a limit of N.
  Acceptable for a local single-user gateway.
- **Audit store:** `query()` default 500-row cap (export passes an explicit large
  limit); no runtime enum check on `decision`; no `ts` tiebreaker for
  same-millisecond ordering.
- **`persistAlways` swallows disk-write failures** with `console.error` only, then
  proceeds (in-memory `config.policies` is still updated, so the rule applies this
  session).

## Security hardening (defense-in-depth; not current holes)
- **Audit redaction only covers pattern-matched secrets.** `secret:high-entropy`
  and `path:*`-flagged values are persisted/exported raw. Consider redacting the
  offending substring for any `secret:`-flagged arg, or document the gap in the
  README threat model.
- **`server.close()` may delay** on lingering keep-alive connections — relevant if
  `warden stop` / CLI shutdown ever needs prompt teardown.

## Scanner coverage
- GitHub token pattern misses the newer `github_pat_` fine-grained format.
- Empty `allowed_roots: []` silently skips the path check (same as unset); untested.

## UX / polish
- `warden import`: malformed client JSON throws a raw `SyntaxError` instead of a
  friendly `[warden] …` message; backup filename uses ms-resolution `Date.now()`
  (two `--apply` runs in the same ms collide).
- Downstream test prints a pre-existing `MODULE_NOT_FOUND` stderr stack from a
  deliberate bad-spawn fixture — harmless, but noisy in CI logs.
- README doesn't explicitly note that resources/prompts proxying is out of scope
  for v1 (tools-only frontend).
- `overLimit` glob-detection regex treats a literal tool name containing glob
  metacharacters as a pattern; harmless in practice (MCP tool names are
  `[a-z0-9_-]`).

## Scope parked from the original design (v2)
LLM-based scanning; remote/HTTP downstream servers; team/multi-user mode; MCP
elicitation-based approvals; policies on resources/prompts; data-flow taint
tracking between tools; streamable HTTP frontend.
