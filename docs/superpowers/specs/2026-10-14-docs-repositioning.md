# Brief — README repositioning + ARCHITECTURE.md refresh

Edit ONLY `README.md` and `ARCHITECTURE.md`. Do not touch code, tests, or other docs. Do not commit.

## Why
Competitive research (2026-10-14) found many MCP gateways with the same core
(YAML allow/deny/ask rules + approval + audit). The one thing warden does that no
one else clearly does is `warden simulate`: replay your recorded tool-call history
against a proposed policy and see exactly which past calls would change decision.
The README should lead with that.

## README.md changes
1. Replace the tagline + first two paragraphs with a sharper opening. The headline idea:
   **"Test your AI agent's safety rules against what it actually did — before you turn them on."**
   Then one short paragraph: warden is a local gateway between your agent and its MCP
   servers (policy, human approval, secret/injection scanning, audit log), and the
   difference is that you can dry-run any policy change against your own history.
   Keep "Zero infrastructure / one process / one SQLite file / no cloud" as a short line.
2. Move the "Simulate before you ship" section to come right after the Quickstart
   (before "Policies"). Keep its content. **Do not edit the example output code block
   inside it** — it will be updated separately.
3. Add a short "How warden fits with your client's permissions" section after the threat model:
   Claude Code (and others) already let you allow/ask/deny MCP tools by name. Use those
   for simple name-based rules. warden adds what they don't: inspecting the *arguments*
   and *results* (secrets, paths, prompt injection), one audit trail across every client,
   and simulate. 3–5 sentences, no marketing fluff, no competitor names.
4. Keep everything else (commands table, threat model, development) intact.
Tone: plain, honest, concise — match the existing README voice.

## ARCHITECTURE.md fixes (it is stale)
1. Add a section for `src/simulate.ts` (between gateway and dashboard sections, renumber as
   needed): it replays audit rows against a proposed config using the same engine
   functions (`evaluate`, `evaluateArgsPhase`, `evaluateResultPhase`); rate limits and human
   clicks are not replayed; it compares the *policy verdict* recorded at the time (the
   `policy_decision` audit column, inferred from the reason for older rows) with the new
   verdict; reports unchanged / now denied / now allowed / now need approval, plus skipped
   (unknown tool / internal error) and an "approximate" note when redacted args meet
   args-matching rules. Mention `warden simulate [--config] [--json] [--limit]` in the CLI section.
2. Audit store section: mention the `reason` and `policy_decision` columns and the
   backward-compatible `migrate()`.
3. Section 5 `demo/`: it IS committed now. List `warden.yaml`, `driver.mjs`,
   `warden-fs.yaml`, `fs-driver.mjs` (real filesystem server demo). Remove `probe.mjs` (doesn't exist).
4. Tests table: add `simulate.test.ts`. Change the hard-coded test count to say
   "run `npm test` for the current count" instead of a number.
5. Dashboard section: mention the "Why" column showing the decision reason.
Read the actual files before describing them; do not invent behavior.

When done, reply with: DOCS DONE and a 3-line summary.
