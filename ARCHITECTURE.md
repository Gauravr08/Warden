# warden — How It Works (every file, every folder)

This document walks the whole codebase top to bottom: what each folder is for,
what each file does, how a single tool call flows through the system, and how the
pieces connect. Read it once and you can navigate the repo without guessing.

If you want the "why" and the product pitch, see `README.md`. If you want the
formal design decisions, see `docs/superpowers/specs/`. This file is the map of
the *code*.

---

## 1. The one-paragraph mental model

warden is a **single Node.js process** that sits in the middle of the road
between an AI agent (Claude Code, Cursor, Claude Desktop…) and every **MCP
server** that agent uses. The agent is configured to talk to exactly one MCP
server: warden. warden spawns the *real* MCP servers as child processes behind
it, and forwards tool calls — but only after each call passes through a
**pipeline**: scan the arguments → check policy → maybe pause for human approval
→ forward to the real server → scan the result → write to an audit log. A small
web dashboard on `127.0.0.1` shows pending approvals and the audit trail.

Everything else in the repo is one of those pipeline stages, the plumbing that
wires them together, or tests.

```
        ┌─────────────────────────── warden process ───────────────────────────┐
Agent ──┤ frontend (MCP server)  →  GATEWAY PIPELINE  →  downstream manager ─────┤──→ real MCP servers
(stdio) │                              │  │  │  │                                 │      (child procs)
        │                    scanner  policy approval audit                       │
        │                              │                                          │
        │                        dashboard (127.0.0.1 http + SSE) ← you click     │
        └───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Top-level files

| File | What it is |
|------|-----------|
| `package.json` | Project manifest. Scripts: `build` (tsc), `test` (vitest, e2e excluded), `test:e2e` (real spawned-process test), `dev` (run CLI via tsx). `bin.warden` → `dist/cli/index.js`, so `npx warden` works after build. Node ≥ 20, ESM (`"type": "module"`). |
| `tsconfig.json` | TypeScript config. `strict: true`, `module: NodeNext` (so relative imports inside `src/` end in `.js`), compiles `src/` → `dist/`. |
| `vitest.config.ts` | Test runner config. Includes `tests/**/*.test.ts`; **excludes `tests/e2e/**` unless `E2E=1`** is set (so the normal `npm test` stays fast and the real-process test only runs on demand). |
| `.gitignore` | Ignores `node_modules/`, `dist/`, `*.tsbuildinfo`. |
| `LICENSE` | MIT. |
| `README.md` | User-facing: quickstart, policy cookbook, honest threat model, commands table. |
| `ARCHITECTURE.md` | This file. |

---

## 3. `src/` — the implementation

Each subfolder is one responsibility. Files are deliberately small (the biggest,
`gateway.ts`, is ~260 lines) so each one holds a single idea.

### 3.1 `src/config/` — reading `warden.yaml`

The single source of truth for warden's behavior is one YAML file. This folder
turns that file into validated, typed objects.

- **`schema.ts`** (49 lines) — Zod schemas + TypeScript types for the whole config:
  `WardenConfig`, `ServerConfig`, `PolicyRule`, `LimitRule`, `Match`, and the
  `Action = "allow" | "deny" | "approve"` union. Every field's default lives here
  (e.g. `defaults.action` = `"approve"`, `dashboard.port` = `9977`,
  `approval_timeout_ms` = `120000`, `audit.retention_days` = `30`). If a config
  key isn't in these schemas, it's rejected.
- **`load.ts`** (49 lines) — `loadConfig(path)` reads the YAML, parses it, validates
  it against the schema, and throws a readable `ConfigError` on any problem
  (YAML syntax error with line/column, schema violation naming the bad path, or
  an unset environment variable). Also exports two helpers reused everywhere:
  `expandEnv(s)` (substitutes `${VAR}` from the environment) and `expandHome(p)`
  (expands a leading `~` to the home directory).
  `parseConfigText(raw, label)` is the YAML-parse + schema-validate + env/home
  expansion step, split out of `loadConfig` so the dashboard can validate
  *unsaved* text with identical errors.

### 3.1b `src/paths.ts` — shared path normalization

One place that decides what "the same path" means, used by both the matcher and
the scanner. `normalizePath(p, caseInsensitive)` expands `~`, converts
backslashes, and — for absolute paths only — collapses `.`/`..`/duplicate slashes
(the drive prefix is split off first so `..` can never climb above `C:/` or `/`),
then lowercases only when `caseInsensitive` (default: Windows). This closes the
case-change and `allowed/../private` bypasses of `args` deny rules and
`allowed_roots`. Also exports `looksLikeAbsolutePath` (length/newline-capped, for
the scanner) and `isAbsolutePathLike` (no cap, for matching — a cap would be a
bypass).

### 3.2 `src/policy/` — the decision engine

Given a tool call, decide `allow` / `deny` / `approve`. Pure logic, no I/O — which
is why it's the most heavily unit-tested part.

- **`matcher.ts`** (35 lines) — the two matching primitives.
  `globMatch(pattern, value)` (glob match, with `"*"` short-circuiting to "match
  anything") and `argsMatch(patternObj, args)` (matches dot-path keys into the
  call's arguments — string values are glob-matched after `~`/backslash
  normalization, everything else is exact equality). Built on the `picomatch`
  library.
- **`engine.ts`** (66 lines) — the rulebook evaluator. Three exports:
  - `evaluate(cfg, input)` → `Decision` — walks `policies` top to bottom,
    **first match wins**, falls back to `defaults.action` if nothing matches.
  - `evaluateArgsPhase(cfg, input)` → `Decision | null` — considers **only** rules
    carrying an `args_contain_secret` condition. The gateway uses this to
    **escalate** a decision to `deny` when a secret/path flag is present, so a
    broad `allow` can never leak a secret regardless of rule order.
  - `evaluateResultPhase(cfg, input)` → `Decision` — the mirror image for the
    *result* side: considers only rules with `result_has_injection`; if a tool's
    result is flagged for prompt-injection, this decides deny/approve (default:
    escalate to human approval).
  A `Decision` is `{ action, ruleIndex, reason }` — `reason` is what the user
  sees in a `Blocked by warden: …` message.
- **`writer.ts`** (14 lines) — `appendPolicyRule(configPath, rule)`. When you click
  "Always allow" / "Always deny" in the dashboard, this appends a matching rule to
  the end of the `policies` list in `warden.yaml`, **preserving your comments**
  (uses the `yaml` library's Document API, not a dumb re-serialize).

### 3.3 `src/scanner/` — the sniffers

Heuristic detectors. Honest about being heuristics (see the README threat model).

- **`secrets.ts`** (69 lines) — scans **outbound** arguments. `scanArgs(args, opts)`
  returns a list of flags: `secret:aws-access-key`, `secret:github-token`,
  `secret:private-key`, `secret:jwt`, `secret:slack-token`, `secret:high-entropy`
  (via a Shannon-entropy check), and `path:outside-roots` (absolute paths outside
  the configured `scanner.allowed_roots`). If the args can't even be
  JSON-serialized it fails **closed** with `secret:unserializable`. Also exports
  `SECRET_PATTERNS` (reused by the audit log for redaction) and `shannonEntropy`.
- **`injection.ts`** (18 lines) — scans **inbound** results. `scanResult(result)`
  returns `injection:*` flags for known prompt-injection shapes: override phrases
  ("ignore previous instructions"), system-prompt-looking text, hidden HTML
  comment instructions, zero-width Unicode, large base64 blobs, ANSI escapes.
- **`index.ts`** (2 lines) — barrel that re-exports `scanArgs`, `scanResult`,
  `SECRET_PATTERNS`, `shannonEntropy` so the gateway imports from one place.

### 3.4 `src/audit/` — the notebook

- **`store.ts`** (128 lines) — `AuditStore`, a thin wrapper over a SQLite database
  (`better-sqlite3`) at `~/.warden/audit.db`. One row per tool call: timestamp,
  server, tool, redacted args, decision, matched rule (`rule_index`), the decision
  `reason`, scanner flags, whether it was forwarded, approval actor + latency,
  result size, duration, error.
  Methods: `insert`, `query(filter)` (newest-first, used by the dashboard and
  `warden export`), `countForwardedSince` / `forwardedToolsSince` (used for rate
  limiting), `purgeOlderThan` (retention), `close`. `redactSecrets(text)` replaces
  any `SECRET_PATTERNS` match with `[REDACTED:<flag>]` **before** anything is
  written — secrets never hit disk in cleartext (pattern-matched ones, at least).
  It also stores `policy_decision`: the policy verdict before rate limiting and
  human input (`null` if policy never ran), used by `simulate`.
  The constructor runs a backward-compatible `migrate()` that `ALTER TABLE`s in
  the `reason` and `policy_decision` columns when opening an `audit.db` written by an older version, so
  existing databases keep working without a manual rebuild.

### 3.5 `src/approval/` — the human gate

- **`manager.ts`** (66 lines) — `ApprovalManager` (an `EventEmitter`). When the
  pipeline needs a human, it calls `request(...)`, which returns a Promise that
  stays unresolved until either you decide in the dashboard or the timeout fires.
  - `request(input)` → emits a `"pending"` event (the dashboard and the OS-toast
    both listen), returns a Promise.
  - `resolve(id, action)` — called by the dashboard when you click; `action` is
    `approve` / `deny` / `always_allow` / `always_deny`. Emits `"resolved"`.
  - Timeout → resolves to `{ approved: false, actor: "timeout" }` (fails **closed**,
    "user did not approve"). Never rejects.
  - `list()` — the pending queue the dashboard reads.

### 3.6 `src/downstream/` — the real MCP servers

- **`manager.ts`** (115 lines) — `DownstreamManager` (an `EventEmitter`). Reads the
  `servers:` block, spawns each real MCP server as a **stdio child process** using
  the official MCP SDK `Client` + `StdioClientTransport`. Tracks state per server
  (`starting` / `running` / `degraded` / `stopped`), **auto-restarts on crash**
  with exponential backoff (max 3), and re-emits `toolsChanged` when a downstream
  server's tool list changes. `listTools(name)` and `callTool(name, tool, args)`
  are how the gateway reaches the real servers. If a server won't start, it goes
  `degraded` and its tools error — **the other servers are unaffected**.

### 3.7 `src/registry.ts` (38 lines) — the tool phone book

- `ToolRegistry` — aggregates every downstream server's tools into one list the
  agent sees. Keeps original tool names when they're unique; when two servers both
  expose a tool with the same name, **both** get prefixed `serverName__toolName`
  so there's no ambiguity. `resolve(exposedName)` maps the name the agent used
  back to `{ server, originalTool }` so the gateway knows where to route the call.
  On a duplicate exposed name it keeps the first and warns (deterministic, never
  silently drops).

### 3.8 `src/gateway.ts` (261 lines) — the pipeline (the heart)

This is where everything meets. `Gateway` owns an MCP `Server` (the *frontend* the
agent connects to) and wires the request handlers:

- `ListToolsRequestSchema` → returns `registry.list()`.
- `CallToolRequestSchema` → runs **`callTool(name, args)`**, the pipeline:

  1. **Resolve** the exposed tool name to a real `{ server, tool }` (unknown →
     `deny`, "unknown tool", audited).
  2. **Scan args** → `scanArgs` produces flags.
  3. **Evaluate policy** → `evaluate(...)` gives the base decision.
  4. **Secret escalation** → if secret/path flags are present, `evaluateArgsPhase`
     can raise `allow` → `deny` (never downgrades).
  5. **Rate limit** → if an `allow` would exceed a configured
     `max_calls_per_hour` (glob-aware, aggregated across matching tools), convert
     to `deny`.
  6. **Approval** → if the decision is `approve`, `await approvals.request(...)`;
     block until you click or it times out. "Always" choices persist a rule via
     `writer.ts`.
  7. **Forward** → `downstream.callTool(...)` (only now is the call marked
     `forwarded: true` in the audit record).
  8. **Scan result** → `scanResult`; if flagged, `evaluateResultPhase` may block
     or escalate to a second approval.
  9. **Audit** → write the row. Return the result — or a `Blocked by warden: …`
     error if any stage denied.
  The whole thing is wrapped so **any thrown error fails closed** (denies +
  audits). A downstream *tool* failing (not warden's fault) is reported distinctly
  as `Tool call failed: …` with `decision: allow, forwarded: true`, so the audit
  trail stays honest about who decided what.

### 3.9 `src/simulate.ts` (120 lines) — dry-run against your history

`simulate(cfg, records)` replays **recorded
audit rows** against a **proposed** config and reports which past calls would
change decision. `redecide` mirrors the gateway's policy pipeline exactly, calling
the same engine functions — `evaluate` (base, first match wins), then
`evaluateArgsPhase` (secret/path escalation; **deny only, never downgrades**) and
`evaluateResultPhase` (injection escalation) — so the preview matches what the
live gateway would decide. Rate limits and human clicks are **not** replayed; an
escalation to `approve` is reported as its own outcome.

It compares **policy verdict to policy verdict**, not final outcome. The audit
`decision` column is the outcome *after* rate limiting and human clicks, so a call
the user approved is stored as `allow`. `historicalPolicyDecision(r)` returns the
verdict the policy gave at the time: the `policy_decision` column when present,
otherwise it is inferred from the `reason` for older rows (human-decided → `approve`,
`rate limit exceeded` → `allow`). Rows that never reached policy (unknown tool,
internal error) are counted as `skipped`. Replaying an unchanged policy therefore
reports zero changes — `tests/gateway.test.ts` proves this with a round-trip test.

Each compared row is bucketed by its new verdict: `unchanged`, `nowDenied`,
`nowAllowed`, `nowPrompt` (would now need approval). `approximate` counts rows whose
stored args were redacted while the proposed policy has `match.args` rules (the
replay may not match the original exactly). Each changed call is added to
`changes` as `{ server, tool, from, to, reason, ruleIndex }`, so the new rule that
caused it is named. `formatSimulation(result)` renders the human-readable report
that `warden simulate` prints; `--json` emits the raw `SimResult` instead.

### 3.10 `src/dashboard/` — the localhost UI

- **`server.ts`** (132 lines) — `startDashboard(deps, port)`. A plain Node `http`
  server **bound to `127.0.0.1` only** (never network-exposed), with an
  anti-DNS-rebinding **Host-header guard** (rejects non-loopback Host). Routes:
  `GET /` (the page), `GET /api/health`, `GET /api/pending`, `POST /api/pending/:id`
  (approve/deny), `GET /api/audit` (filterable), `GET /api/events`
  (Server-Sent Events stream that pushes `pending`/`resolved`/`warning` live).
  Auto-increments the port if the preferred one is busy. `close()` tears down
  listeners and open SSE connections.
  With `deps.configPath` set (the CLI always sets it) it also serves the Policy
  editor: `GET /api/policy` (`{yaml, hash}` — sha256 of the file text),
  `POST /api/policy/preview` (parse with `parseConfigText`, return
  `simulate()` over the last 5000 audit rows), and `POST /api/policy/apply`
  (409 if `hash` is stale; 400 if the YAML is invalid or if `servers`, `audit`,
  `dashboard` or `approval_timeout_ms` differ from the file on disk — a page must
  never change which commands warden spawns; otherwise atomic write via
  `<path>.tmp` + rename, which the existing `watchPolicies` hot-reloads).
  **CSRF guard on every POST route:** `content-type` must be `application/json`
  (forces a CORS preflight for cross-origin pages) and, if an `Origin` header is
  present, it must be `http://127.0.0.1:<port>` or `http://localhost:<port>`;
  otherwise 403. Request bodies are capped at 1 MB (413).
- **`ui.ts`** (102 lines) — `DASHBOARD_HTML`, the entire single-page UI as one
  self-contained string (no external CSS/JS/CDN). Vanilla JS: renders the pending
  cards (Approve / Deny / Always allow / Always deny) and the audit table, whose
  **Why** column shows each call's decision reason (the `reason`, falling back to
  `rule #n`). A second **Policy** tab holds the YAML editor (edit → Preview
  changes → Apply; Apply stays disabled until the *current* text has been
  previewed), and a dismissible banner surfaces SSE `warning` events (e.g. a
  broken manual edit). Refreshes on SSE events and every 5s. **All untrusted values are
  HTML-escaped** before insertion (fixed XSS — a malicious tool arg can't run
  script in your dashboard).

### 3.11 `src/notify.ts` (13 lines) — the OS toast

- `notifyPending(p)` — fires a native OS notification (via `node-notifier`) when a
  call needs approval, so you notice without staring at the browser tab.
  Best-effort; never throws.

### 3.12 `src/cli/` — the command-line entry

- **`index.ts`** (97 lines) — the `commander` program. Subcommands:
  - `warden start --config warden.yaml` — the main event: builds the whole stack
    and runs it.
  - `warden simulate [--config <path>] [--json] [--limit <n>]` — replays recent
    audit rows (`--limit`, default 5000) against the proposed config and prints
    the report (or the raw `SimResult` with `--json`).
  - `warden status` — reads the state file, pings the dashboard health endpoint.
  - `warden export --config …` — dumps the audit log as JSONL to **stdout**
    (data on stdout, because that subcommand isn't the MCP channel).
  - `warden import --client <kind>` — migrate a client config (see below).
- **`start.ts`** (122 lines) — `startGateway(configPath, frontendTransport?)`, the
  wiring layer. Constructs audit + approvals + downstream + registry + gateway +
  dashboard, wires `notifyPending` to the approval `"pending"` event, starts a
  retention purge timer, and connects the frontend transport (real stdio by
  default; the tests inject an in-memory transport). Also `watchPolicies(...)`,
  which watches `warden.yaml` and **hot-reloads** policy changes into the live
  config (keeping the last-good version if you save a broken file), and
  `stateFilePath()` (`~/.warden/state.json`, overridable via `WARDEN_STATE_FILE`).
  On startup failure it tears down everything it already allocated.
- **`import.ts`** (81 lines) — the migration helpers. `buildWardenYaml(clientCfg)`
  turns an existing `mcpServers` block (Claude Desktop / Claude Code / Cursor)
  into a `warden.yaml`; `swapToWarden(...)` rewrites the client config to point at
  a single `warden` entry; `runImport(opts)` ties it together and (with `--apply`)
  backs up the original before swapping. Skips any server literally named
  `warden` so re-importing can't nest warden inside itself.

**Import surface note:** stdout is the MCP protocol channel. Every human log in
the whole codebase goes to `console.error` (stderr). The deliberate stdout writers
are `warden export` and `warden simulate`.

---

## 4. `tests/` — how each piece is proven

One test file per module, plus integration and end-to-end. Run `npm test` for the
current count; the real-process e2e runs only with `E2E=1`.

| Test file | Proves |
|-----------|--------|
| `smoke.test.ts` | toolchain runs. |
| `config.test.ts` | config loads, defaults apply, bad YAML/schema/env errors are readable. |
| `matcher.test.ts` | glob + dot-path arg matching, including bare `*`. |
| `engine.test.ts` | first-match-wins, args-phase secret escalation, result-phase. |
| `simulate.test.ts` | replay under a proposed policy: unchanged/now-denied/now-allowed/now-approval, secret + injection escalation, report format. |
| `secrets.test.ts` | each secret flag fires; path boundary; unserializable guard. |
| `injection.test.ts` | each injection flag fires; quiet on normal text. |
| `audit.test.ts` | insert/query/redaction/rate-count/purge. |
| `approval.test.ts` | approve/deny/always/timeout + events (fake timers). |
| `writer.test.ts` | rule appended to end, comments preserved. |
| `downstream.test.ts` | real child server: list/call/crash-restart/degraded. |
| `registry.test.ts` | collision prefixing, resolve, duplicate first-wins. |
| `gateway.test.ts` | the whole pipeline: allow/deny/approve/secret/injection/rate-limit/fail-closed. |
| `dashboard.test.ts` | routes, SSE, 404s, Host-guard, XSS escaping. |
| `start.test.ts` | full stack over in-memory transport + hot-reload. |
| `import.test.ts` | config conversion, backup-before-swap, idempotent warden-skip. |
| `e2e/smoke.test.ts` | **real spawned `dist/cli/index.js` gateway** over stdio: list/allow/deny/export. Runs only with `E2E=1`. |
| `fixtures/echo-server.mjs` | a tiny real MCP server (tools `echo`/`danger`/`crash`) used as a fake downstream in several tests **and** the live demo. |

---

## 5. `demo/` — the live playground (committed)

- **`warden.yaml`** — a demo policy: runs the echo fixture as a fake third-party
  server, allows nothing by default (so `echo` triggers an approval card), denies
  `danger`, denies anything with a secret.
- **`driver.mjs`** — pretends to be an AI agent. Spawns the real built warden,
  connects as an MCP client, and makes four calls (list → echo/approve →
  danger/deny → secret/deny) with pauses so you can watch the dashboard.
- **`warden-fs.yaml`** — the real-world demo: warden in front of the official
  filesystem MCP server, which is given the whole sandbox while the policy allows
  writes only under `allowed/`.
- **`fs-driver.mjs`** — the agent driver for the filesystem demo. Proves warden
  (not the server) blocks an out-of-scope write and a secret-bearing write, while
  allowing an in-scope one.

---

## 6. `docs/` — the paper trail

- `docs/superpowers/specs/2026-07-05-warden-mcp-gateway-design.md` — the approved
  design spec (architecture, policy semantics, error handling, the secret-deny
  precedence decision).
- `docs/superpowers/plans/2026-07-05-warden-mcp-gateway.md` — the 16-task
  implementation plan every piece was built from (TDD, step by step).
- `docs/superpowers/FOLLOWUPS.md` — the honest backlog: non-blocking issues and
  v2 ideas surfaced during the build and the final code review.

---

## 7. One call, end to end (worked example)

You run `warden start`. Your agent asks to call `write_file` with
`{ path: "/etc/hosts", content: "..." }`:

1. **Frontend** (`gateway.ts`) receives the MCP `tools/call`.
2. **Registry** resolves `write_file` → `{ server: "filesystem", tool: "write_file" }`.
3. **Scanner** (`secrets.ts`) sees `/etc/hosts` is outside your `allowed_roots` →
   flag `path:outside-roots`.
4. **Policy** (`engine.ts`): your rules allow `filesystem/write_file` only under
   `~/projects/**`, so base decision is… whatever matched. Then
   `evaluateArgsPhase` sees the `path:` flag and a `deny`-on-secret rule →
   **escalates to deny**.
5. **Audit** (`store.ts`) records: deny, the flag, `forwarded: false`.
6. **Frontend** returns `Blocked by warden: matched policy #… (args phase)` to the
   agent. The file is never touched. You see the blocked call in the dashboard.

Had the decision been `approve`, step 4.5 would have paused on
`approvals.request(...)`, popped a card in the dashboard + an OS toast, and waited
for your click before doing anything.

---

## 8. Where to start reading if you're new

1. `src/gateway.ts` — read `callTool`; it names every stage in order.
2. `src/policy/engine.ts` — the decision logic those stages call.
3. `src/config/schema.ts` — the shape of everything.
4. `demo/driver.mjs` + `demo/warden.yaml` — see it move.
