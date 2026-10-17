# Visual policy editor

**Goal:** a user who has never seen YAML can read, change, preview and apply warden's rules from the dashboard. The YAML editor stays available as an "Advanced" mode.

## Server (`src/dashboard/server.ts`, new `src/policy/rules-doc.ts`)

`EditableRules` (JSON shape the UI edits):
```ts
{ defaults: { action: Action },
  policies: PolicyRule[],          // same shape as schema
  limits: LimitRule[],
  allowed_roots: string[] }        // scanner.allowed_roots ([] = key absent)
```

`rules-doc.ts`:
- `rulesFromText(text): EditableRules` uses `parseConfigText`, then picks those four fields. Do not expand env vars or `~` in the returned values: read `scanner.allowed_roots` raw from the YAML doc.
- `applyRulesToText(currentText, rules): string` uses `yaml.parseDocument(currentText)` and sets `defaults`, `policies`, `limits` (delete the key when empty), and `scanner.allowed_roots` (delete it when empty; delete `scanner` if it becomes empty). Returns `doc.toString()`. Everything else (servers, audit, dashboard, comments in untouched sections) must survive byte-for-byte where the yaml lib allows. Validate the result with `parseConfigText` before returning; it throws ConfigError.
- Validate the incoming `rules` with zod (reuse schema pieces) so bad UI input gives a 400 with a readable message.

Routes:
- `GET /api/policy` → `{ yaml, hash, rules | null (null if the file doesn't parse), catalog }`. `catalog = { servers: { [name]: string[] } }`: union of the live tool registry (pass `registry` into DashboardDeps as optional; add `ToolRegistry.catalog()` returning server → original tool names) and the distinct server/tool pairs in the last 5000 audit rows (skip server "unknown"). Sorted.
- `POST /api/policy/preview` and `/apply` accept `{ rules }` as an alternative to `{ yaml }`. With rules, the server builds yaml via `applyRulesToText(<current file text>, rules)`. Apply keeps the hash check first, then the same restricted-sections check. Both responses also return the `yaml` that was used.
- `POST /api/policy/render {rules}` → `{ ok, yaml }` (rules merged into the current file, not written).
- `POST /api/policy/parse {yaml}` → `{ ok, rules }`.
- All existing CSRF/body-size guarantees apply.

## UI (`src/dashboard/ui.ts`, still a template literal: no backticks, no dollar-brace, no backslashes)

Policy tab gets a segmented switch at the top of the editor card: **Simple** | **YAML**. Simple is the default; remember the choice in localStorage (wrap in try/catch). The Edit → Preview → Apply stepper, preview panel, Apply hash/409 handling and toasts keep working in both modes. In Simple mode the "current text" used for dirty/previewed tracking is `JSON.stringify(state)`.

Switching modes: Simple→YAML calls `/render` and fills the textarea. YAML→Simple calls `/parse`; on error, stay in YAML and show the error callout. If the switch happens after a preview, the preview stays valid only if the content is equal (simplest: reset previewed state).

Plain-language vocabulary everywhere: allow = **Allow**, approve = **Ask me**, deny = **Block**. Never show the words yaml/match/args_contain_secret in Simple mode.

Simple mode sections (top to bottom, in the editor card, scrollable):
1. **When no rule matches**: a segmented control (Allow / Ask me / Block) with one-line help.
2. **Rules**, with help text: "Checked top to bottom; the first rule that fits decides. Block rules about secrets always win." Each rule is a card:
   - Header: "Rule N", an action pill-select (colored like the existing ok/warn/bad pills), and icon buttons: move up, move down, duplicate, delete (with aria-labels; disable up on first and down on last).
   - "Server": a select with "Any server", catalog servers, and "Other…", which reveals a text input that accepts wildcards like `git*`. "Tool": the same, with tools of the selected server (all catalog tools when Any).
   - Conditions (checkboxes): "Only if it contains a secret or a file path outside your allowed folders" → `args_contain_secret: true`; "Only if the tool's reply looks like a prompt injection" → `result_has_injection: true`. If YAML has these set to `false`, show the checkbox with a third indeterminate state and the label "(set to 'not' in YAML)"; keep the value unless the user clicks.
   - "Argument conditions" (collapsed `<details>` labeled "More conditions"): rows `[argument name] matches [pattern]` with remove buttons and "+ Add condition". Hint: "e.g. path matches ~/projects/**". Non-string values from YAML are shown read-only with a note "edit in YAML" and preserved.
   - A one-line plain-English summary under the header, e.g. "Block any tool on any server when it contains a secret." / "Ask me before filesystem › write_file."
   - Empty fields mean "Any" (omit the key).
   - "+ Add rule" button, plus an "Add from template" menu: Block secrets everywhere; Allow a tool; Ask before a tool; Block a tool. New rules go at the end, except "Block secrets everywhere", which goes first.
   - Empty state when there are no rules.
3. **Allowed folders**: a list of paths with remove buttons and an input + Add. Help: "Requests that point at files outside these folders are treated like secrets. Leave empty to skip the check."
4. **Rate limits**: rows "[server select] [tool select] at most [number] calls per hour", with remove and "+ Add limit". Help: "Allowed calls beyond this are blocked."

Preview panel in Simple mode: show "rule #n" as "Rule n+1" so it lines up with the cards.

Design: reuse the existing tokens, `.card`, `.btn`, `.pill`, `.seg`, `.callout` styles; inputs get a shared `.field` style (bg-1, border, r-1, 8px 10px padding, focus ring). At ≤720px, the server/tool selects stack and controls stay ≥40px tall. Dark and light themes both need checking. Labels are tied to inputs for accessibility.

## Tests
- `tests/rules-doc.test.ts`: round-trip keeps `servers` and a comment in `servers`; empty limits/allowed_roots remove keys; invalid rules → error; raw `~` path is preserved.
- `tests/dashboard.test.ts`: GET includes rules + catalog; preview with rules; apply with rules writes the merged file (servers intact) and returns the new hash; render/parse; parse of bad YAML → 400; CSRF still enforced on the new POSTs.

`npm test`, `npx tsc --noEmit`, `npm run build` must all pass.
