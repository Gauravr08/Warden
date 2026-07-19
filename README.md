# warden

**Security gateway for MCP.** One process between your agent (Claude Code, Claude Desktop, Cursor, ...) and every MCP server it uses. Each tool call passes a policy check, optional human approval, heuristic scanning, and lands in an audit log.

Agents now hold real credentials — repos, email, filesystems. A malicious MCP server or a prompt-injected tool result runs with *your* authority. warden enforces least privilege at the only chokepoint that sees everything: the tool-call boundary.

**Zero infrastructure.** One process, one SQLite file, no database/queue/identity-provider to stand up. Built for the individual developer and small team who want secret-leak and prompt-injection protection on their local agent setup *without* adopting a governance platform — and who want to **simulate any policy change against their own history before shipping it** (see below). No cloud, no account, runs on your laptop.

## Quickstart (60 seconds)

```bash
# 1. Generate warden.yaml from your existing client config (dry run first)
npx warden import --client claude-desktop
# 2. Apply the swap (timestamped backup is made automatically)
npx warden import --client claude-desktop --apply
# 3. Restart your client. Done — every tool call now flows through warden.
```

Your client config now has a single MCP server (warden); your original servers live in `warden.yaml`. Open the dashboard (URL printed on startup, default `http://127.0.0.1:9977`) to watch calls and answer approval prompts.

## Policies

`warden.yaml`, first match wins, unknown tools ask you first:

```yaml
defaults:
  action: approve         # not matched by any rule -> ask the human

policies:
  - match: { server: github, tool: "get_*" }
    action: allow          # reads are fine
  - match: { server: github, tool: "delete_*" }
    action: deny
  - match: { server: filesystem, tool: write_file,
             args: { path: "~/projects/**" } }
    action: allow          # writes only inside my projects
  - match: { tool: "*", args_contain_secret: true }
    action: deny           # nothing that smells like a credential leaves

limits:
  - match: { server: github }
    max_calls_per_hour: 100
```

Actions: `allow`, `deny`, `approve` (pause for a click in the dashboard; timeout denies). "Always allow/deny" buttons append rules here for you. Edits hot-reload; invalid edits keep the last good policy.

## Simulate before you ship

Writing first-match-wins glob rules blind is the real pain. `warden simulate` replays your **recorded audit history** against a **proposed** `warden.yaml` and tells you exactly which past calls would change decision — *before* you apply it:

```bash
# edit warden.yaml however you like, then:
warden simulate --config warden.yaml
```

```
Replayed 4 calls from the audit log against the proposed policy.

  unchanged:         3
  now DENIED:        1   (were allowed before)
  now ALLOWED:       0   (were denied before)
  now need APPROVAL: 0

Changed decisions:
  allow -> DENY  fs/read_text_file  — default action
```

Every changed call names the new rule that caused it. Add `--json` for a machine-readable result. It reuses the exact same policy engine the live gateway runs — including secret/path and prompt-injection escalation — so the preview matches reality. (Rate limits are time-window dependent and are not simulated.) Pair it with the dashboard's **Why** column, which shows the matched rule/reason for every real call, and you can write policy with confidence instead of guessing.

## Threat model — honest version

**Stops:** unvetted MCP servers doing destructive/out-of-scope things silently; credentials wandering out through tool args; rate-runaway agents; known prompt-injection shapes in tool results reaching your agent unreviewed; "what did the agent actually do?" (audit log with redaction).

**Does not stop:** a sophisticated injection crafted to evade regex heuristics; a malicious server abusing access you explicitly allowed; anything outside MCP (the agent's own shell access, network, etc.). Scanning is defense-in-depth, not a guarantee. Give risky servers `approve`-by-default policies, not `allow`.

## Commands

| Command | What it does |
|---|---|
| `warden start [--config warden.yaml]` | Run the gateway (stdio MCP server + dashboard) |
| `warden simulate [--config warden.yaml] [--json]` | Dry-run a proposed policy against recorded history; show what would change |
| `warden import --client <kind> [--apply]` | Migrate `claude-desktop` / `claude-code` / `cursor` config |
| `warden status` | Is a gateway running, where is the dashboard |
| `warden export` | Audit log as JSONL on stdout |

## Development

```bash
npm install
npm test          # unit + integration
npm run build
npm run test:e2e  # real processes end to end
```

MIT license. Node >= 20.
