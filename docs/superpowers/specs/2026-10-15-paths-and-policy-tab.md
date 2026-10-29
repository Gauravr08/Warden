# Spec — path-matching fixes + dashboard Policy tab

Two parts. Do Part A first, get `npm test` green, then Part B. TDD: failing tests
first. Match existing style (terse, small functions, comments only where
non-obvious). Do not commit.

---

## Part A — path matching security fixes

### Bugs (verified)
1. **Case.** On Windows, paths are case-insensitive but `argsMatch` (src/policy/matcher.ts)
   glob-matches case-sensitively. Rule `args: { path: "C:/Users/asus/x/**" }` does NOT
   match `C:/Users/ASUS/x/a.txt`. Allow rules silently fail; worse, a **deny** rule on a
   path is bypassed by changing letter case.
2. **Dot-dot.** Neither the matcher nor the scanner resolves `.`/`..` segments.
   - deny rule `C:/s/private/**` does not match `C:/s/allowed/../private/k.txt` → bypass.
   - `scanArgs` `inside()` (src/scanner/secrets.ts) treats `<root>/allowed/../private/x`
     as inside root `<root>/allowed` → no `path:outside-roots` flag → bypass.
3. **Over-broad lowercasing.** `normalized()` in secrets.ts lowercases on every OS,
   so on Linux/macOS `/Home/x` counts as inside `/home` (listed in FOLLOWUPS.md).

### Design
New module `src/paths.ts` (shared by matcher and scanner):
```ts
export const CASE_INSENSITIVE_FS = process.platform === "win32";
export function looksLikeAbsolutePath(s: string): boolean   // move from secrets.ts unchanged
export function normalizePath(p: string, caseInsensitive = CASE_INSENSITIVE_FS): string
```
`normalizePath`: `expandHome` → backslashes to `/` → if it looks like an absolute path
(`/^([A-Za-z]:\/|\/)/` after slash conversion), collapse `.`/`..`/duplicate slashes with
`path.posix.normalize` (must keep the `C:` drive prefix; `..` must never climb above the
drive root or `/`) → if `caseInsensitive`, lowercase. Non-path strings: only the
expandHome + slash conversion that exists today (no lowercasing, no normalize).

`matcher.ts`:
- `argsMatch(pattern, args, opts: { caseInsensitive?: boolean } = {})`, default
  `CASE_INSENSITIVE_FS`. For string pairs: value → `normalizePath(actual, false)`; pattern
  → existing `normalizePathlike` (expandHome + slashes; do NOT path-normalize a glob).
  Use picomatch `nocase: true` **only when** `caseInsensitive` AND the actual value looks
  like an absolute path. Non-path strings stay case-sensitive everywhere.
- `globMatch` (server/tool names) unchanged.

`secrets.ts`:
- `scanArgs(args, opts: { allowedRoots?: string[]; caseInsensitive?: boolean })`, default
  `CASE_INSENSITIVE_FS`. Use `normalizePath(x, caseInsensitive)` for roots and candidate
  paths. Delete the local `normalized`/`looksLikeAbsolutePath` in favour of src/paths.ts.

No changes to engine.ts / gateway.ts call sites are needed (defaults apply).

### Tests
- `tests/paths.test.ts`: drive prefix kept; `..` collapsed; `..` can't climb above `C:/`
  or `/`; backslashes; `~`; lowercase only when caseInsensitive; non-path strings untouched.
- `tests/matcher.test.ts`: with `{caseInsensitive: true}` a mixed-case path matches a
  lowercase glob; with `false` it doesn't; non-path string args stay case-sensitive even
  with `true`; `allowed/../private/k` matches a `private/**` pattern and does NOT match
  `allowed/**`.
- `tests/secrets.test.ts`: `<root>/allowed/../private/x` is flagged `path:outside-roots`
  for root `<root>/allowed`; with `caseInsensitive: false`, `/Home/x` is outside `/home`;
  with `true`, `C:/USERS/a` is inside `c:/users`.
- One engine-level test: a deny rule on `C:/s/private/**` denies `C:/S/allowed/../PRIVATE/k`
  when caseInsensitive (pass opts through a direct `argsMatch` test if engine has no opts;
  do not change engine signatures just for tests).

---

## Part B — dashboard "Policy" tab (edit → preview → apply)

Goal: the user edits `warden.yaml` in the dashboard, clicks **Preview** to see exactly
which past calls would change (the existing `simulate()`), then **Apply** to save the
file. The existing watcher (`watchPolicies` in src/cli/start.ts) hot-reloads it; no
restart. No terminal needed.

### Config parsing
In src/config/load.ts extract `parseConfigText(raw: string, label: string): WardenConfig`
(the YAML parse + schema validation + env/home expansion currently inside `loadConfig`);
`loadConfig` reads the file then calls it. Error messages unchanged.

### Server (src/dashboard/server.ts)
- `startDashboard(deps: { approvals; audit; configPath?: string }, port)`. When
  `configPath` is undefined the policy routes 404 (keeps existing tests valid).
  Wire `configPath` in src/cli/start.ts.
- `GET /api/policy` → `{ yaml: <file text>, hash: <sha256 hex of file text> }`.
- `POST /api/policy/preview` body `{ yaml }` → parse with `parseConfigText`; on error
  `400 { ok: false, error }`; else `200 { ok: true, result: simulate(cfg, audit.query({ limit: 5000 })) }`.
- `POST /api/policy/apply` body `{ yaml, hash }`:
  - `409 { ok:false, error:"warden.yaml changed since you loaded it — reload and re-apply" }`
    if `hash` ≠ sha256 of the current file (e.g. "Always allow" appended a rule meanwhile).
  - `400` if it doesn't parse/validate.
  - `400 { ok:false, error:"Only policies, limits, defaults and scanner can be changed here — edit servers/audit/dashboard in the file directly." }`
    if the parsed `servers`, `audit`, `dashboard`, or `approval_timeout_ms` differ
    (deep-equal on the parsed objects) from the current file's parsed config. Reason: a
    page must never be able to change which commands warden spawns.
  - else write atomically (write `<path>.tmp` then rename over) → `200 { ok:true, hash: <new hash> }`.
- **CSRF guard for ALL POST routes (including the existing `/api/pending/:id`):**
  reject with 403 unless `content-type` starts with `application/json`; and if an
  `Origin` header is present it must be `http://127.0.0.1:<port>` or
  `http://localhost:<port>` (the actual bound port). Reason: a malicious website open in
  the user's browser can otherwise POST to 127.0.0.1 and approve calls or rewrite policy.
- `readBody`: cap at 1 MB → reject with 413 (also listed in FOLLOWUPS.md).

### UI (src/dashboard/ui.ts)
- Two tabs in the header: **Live** (everything that exists today, unchanged) and **Policy**.
- Policy tab:
  - a monospace `<textarea>` loaded from `GET /api/policy` (set via `.value`, never innerHTML);
  - buttons **Preview changes**, **Apply**, **Reload from file**;
  - Apply is disabled until a successful Preview of the *current* text (editing the text
    after a preview disables it again);
  - results area: one summary line (`N unchanged · N now ALLOWED · N now DENIED · N now need APPROVAL`,
    plus skipped / approximate when > 0), then a table of changes: from → to, server/tool, reason,
    rule #; if no changes, "No past calls would change. Safe to apply.";
  - errors (400/409) shown inline in red; success shows "Applied — warden is using these rules now."
  - Every value from the server goes through the existing `esc()` before innerHTML.
- Show a dismissible warning banner on the existing SSE `warning` event (today the UI ignores it,
  so a broken manual edit is silent).
- Keep it dependency-free and in the existing visual style. Short helper text at the top of
  the Policy tab: "Edit your rules, preview what would have changed against your recorded
  history, then apply. Nothing is saved until you click Apply."

### Tests (tests/dashboard.test.ts; use a temp dir config file)
- GET /api/policy returns file text + hash; 404 when no configPath.
- preview: valid YAML returns a SimResult reflecting seeded audit rows; invalid YAML → 400.
- apply: writes file + returns new hash; stale hash → 409 and file untouched; changing
  `servers` → 400 and file untouched; invalid YAML → 400.
- CSRF: POST without `application/json` → 403; POST with `Origin: http://evil.example` → 403;
  same-origin Origin → allowed. Existing pending-approval tests still pass (send JSON content-type).
- body > 1 MB → 413.
- UI HTML contains the Policy tab, and the changes table uses `esc(` (mirror the existing XSS test).
- tests/start.test.ts: applying via the API hot-reloads the live config (policy takes effect).

### Docs
README: in "Simulate before you ship", add 2–3 sentences that the dashboard's **Policy** tab
does the same thing in the browser (edit → Preview → Apply, hot-reloads, no restart), and
that the CLI command remains for scripts/CI. ARCHITECTURE.md: document `src/paths.ts`, the
new dashboard routes + CSRF guard, and `parseConfigText`. docs/superpowers/FOLLOWUPS.md:
remove the now-fixed items (path lowercasing, readBody cap).

## Done when
`npm test` green, `npx tsc -p tsconfig.json --noEmit` clean, `npm run build` ok.
