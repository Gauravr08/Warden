# Warden — MCP Security Gateway: Design Spec

**Date:** 2026-07-05
**Status:** Approved
**Working name:** `warden` (verify npm availability before publish; rename is cheap until then)

## 1. Problem & Goal

AI agents (Claude Code, Cursor, Windsurf, etc.) now run with real credentials and install third-party MCP servers freely. Every tool call executes with the user's full authority: an untrusted MCP server, or a prompt-injected tool result, can read secrets, exfiltrate data, or perform destructive actions. No widely adopted runtime layer enforces least privilege between an agent and its tools.

**Goal:** an open-source (MIT) security gateway that sits between the agent client and all MCP servers. Every tool call passes through a policy check, optional human approval, heuristic scanning, and an audit log.

**Target user (v1):** individual developers running local agents with third-party MCP servers.

**Success criteria:**
- A user can migrate an existing Claude Code/Cursor MCP setup to run behind warden in under 5 minutes (`warden import`).
- Tool calls are allowed, denied, or paused for approval per a declarative policy file.
- Every call is auditable after the fact.
- The gateway never fails open.

## 2. Architecture

Central hub (single Node.js/TypeScript process). The agent client is configured with exactly one MCP server: warden. Warden spawns and manages all downstream MCP servers as child processes and aggregates their tools.

Rejected alternatives:
- **Per-server wrapper proxy** — drop-in but N processes need shared state for dashboard/audit/approvals; coordination cost outweighs adoption benefit.
- **Wrapper + shared daemon** — best ergonomics, most moving parts; a reasonable v2 evolution, premature for v1.

### Components

| # | Component | Responsibility |
|---|-----------|----------------|
| 1 | Frontend server | Speaks MCP to the agent client. stdio transport in v1. |
| 2 | Downstream manager | Reads `warden.yaml`, spawns downstream MCP servers (stdio child processes), maintains sessions, restarts crashed servers with backoff, forwards notifications (`tools/listChanged` etc.). |
| 3 | Tool registry | Aggregates downstream `tools/list`. Original tool names preserved; on collision, prefixed `serverName__toolName`. |
| 4 | Policy engine | Pure function: `(server, tool, args, context) → allow \| deny \| approve`. Rules from `warden.yaml`. First match wins. |
| 5 | Approval manager | Holds calls pending human decision. Timeout (default 120 s) → deny. Resolved from dashboard. |
| 6 | Scanner | Heuristics on outbound args (secrets/exfil) and inbound results (prompt injection). Emits flags; policy decides consequences. |
| 7 | Audit store | SQLite (`better-sqlite3`) at `~/.warden/audit.db`. One row per call. |
| 8 | Dashboard | Localhost web UI served from the same process. Pending approvals, live audit tail, policy view. SSE for realtime push. |
| 9 | CLI | `warden start`, `warden import`, `warden status`, `warden export`. |

### Data flow (per tool call)

```
agent → tools/call → [scanner: args] → [policy engine] ─ allow ──→ downstream server
                                            │ deny  → error result to agent
                                            │ approve → approval manager → dashboard
                                            │              user decision ─┘ (timeout → deny)
downstream result → [scanner: result] ─ clean → audit → agent
                                        flagged → per policy: annotate / deny / approve
```

Non-tool MCP traffic (resources, prompts) is proxied and audited but not policy-gated in v1.

## 3. Policy Engine

Single config file `warden.yaml` holds downstream server definitions, policies, and limits:

```yaml
servers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" }
  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "~/projects"]

defaults:
  action: approve            # unknown tool → ask the human; safe default

policies:
  - match: { server: github, tool: "get_*" }
    action: allow
  - match: { server: github, tool: "delete_*" }
    action: deny
  - match: { server: filesystem, tool: write_file,
             args: { path: "~/projects/**" } }
    action: allow
  - match: { tool: "*", args_contain_secret: true }
    action: deny

limits:
  - match: { server: github }
    max_calls_per_hour: 100
```

Semantics:
- Rules evaluated top to bottom; first match wins; no match → `defaults.action`.
- `tool` and `server` match by glob. `args` matches dot-path keys into the call arguments; glob for string values, exact equality otherwise.
- Scanner verdicts are exposed as match conditions (`args_contain_secret`, `result_has_injection`) so consequences are policy-driven, not hardcoded.
- Rate limits are checked after a policy `allow`; exceeding a limit converts the decision to `deny` with a rate-limit error.
- Engine is a pure function (plus a SQLite counter read for limits) — table-driven unit tests.
- Hot reload: file watcher re-validates on change; invalid file keeps last-good policy and surfaces a dashboard warning. Invalid file at startup refuses to start with a line-numbered error.

## 4. Approval Flow

1. A call resolving to `approve` creates a pending record: id, server, tool, pretty-printed args, scanner flags.
2. Dashboard shows an approval card via SSE; an OS toast notification (`node-notifier`) fires so the user notices without watching the dashboard.
3. User actions: **Approve once**, **Deny**, **Always allow**, **Always deny**. The "always" actions append a matching rule to `warden.yaml` (above the defaults, below existing explicit rules).
4. The agent's MCP call simply blocks while pending. Timeout (default 120 s, configurable) → deny with the error `Blocked by warden: user did not approve`, which the agent can relay to the user.

## 5. Scanner (v1 = heuristic tier)

- **Outbound args:** regex bank for secret shapes (AWS keys, GitHub tokens, private-key headers, JWTs), high-entropy string detector, absolute paths outside configured allowed roots.
- **Inbound results:** injection pattern bank (imperative override phrases such as "ignore previous instructions", system-prompt-shaped text, hidden-instruction markers, zero-width Unicode, large base64 blobs, ANSI escape sequences).
- Verdict is a list of flags, not a binary. Policy decides consequences. Defaults shipped: secret flags → deny; injection flags → escalate to approve.
- Documentation states plainly: these are heuristics — defense in depth, not a guarantee. LLM-based scanning is v2.

## 6. Audit Log

- SQLite row per call: id, timestamp, server, tool, args (JSON, secrets redacted before write), decision, matched rule, scanner flags, approval actor and latency, result size, duration, error.
- Dashboard: filterable table (server / tool / decision / time range), call detail view, live tail.
- `warden export` → JSONL. Retention configurable, default 30 days.

## 7. Error Handling

Fail closed, always:
- Downstream crash → auto-restart with backoff (max 3 attempts), then mark degraded (red in dashboard). That server's tools return a clear error to the agent; other servers are unaffected.
- Gateway internal error mid-call → deny by default, audit the failure.
- Dashboard port conflict → auto-increment port, print the actual URL.

## 8. Testing Strategy

- **Policy engine:** table-driven unit tests (largest surface, pure function).
- **Scanner:** fixture bank — known injection payloads, secret samples, clean samples; assert emitted flags.
- **Integration:** official MCP SDK in-memory transport — fake downstream server, real gateway, real client; covers full call flow including approval timeout paths.
- **E2E smoke:** real gateway over stdio with `@modelcontextprotocol/server-everything` downstream, scripted client.
- TDD throughout implementation.

## 9. Distribution

- npm package, runnable via `npx warden`. Node ≥ 20. Dashboard assets pre-bundled.
- `warden import`: reads Claude Desktop / Claude Code / Cursor MCP configs, generates `warden.yaml`, swaps the client config to a single warden entry, backs up originals.
- README: 60-second quickstart, explicit threat-model section (what it stops / what it does not), policy cookbook.
- License: MIT.

## 10. Out of Scope (v2 parking lot)

LLM-based scanning; remote/HTTP downstream servers; team/multi-user mode; MCP elicitation-based approvals; policies on resources/prompts; data-flow rules (taint tracking between tools); streamable HTTP frontend.
