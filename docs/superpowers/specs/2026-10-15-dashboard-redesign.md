# Spec — dashboard visual redesign

File: `src/dashboard/ui.ts` (`DASHBOARD_HTML`). Server routes/behavior do NOT change.
Do not commit. Edit/Write tools only.

## Hard constraints
- **Fully self-contained.** No external fonts, CDNs, images, or scripts. Icons are inline SVG.
  (It's a security tool on localhost; it must work offline and leak nothing.)
- **Every server-provided value is escaped with `esc()` before any innerHTML.** The editor is
  filled via `.value`. Keep the existing XSS assertions in tests/dashboard.test.ts passing;
  if a literal-string assertion must change (e.g. pretty-printed args), update it so it still
  proves the same escaping guarantee, and never weaken it.
- Keep all current behavior: SSE live refresh + 5s poll, pending approve/deny/always buttons,
  audit filter, warning banner, Policy tab (load / preview / apply / reload, Apply disabled until
  the current text was previewed, 409/400 errors shown), `<title>warden</title>` in the markup.
- Vanilla JS, one file, no build step. Keep the script readable (small named functions).

## Look & feel (2026 product-dashboard conventions)
- **Design tokens** as CSS custom properties on `:root`: surface/background layers (3 levels),
  border, text (primary/secondary/muted), accent (indigo/blue), semantic colors
  success/danger/warning/info each with a strong + subtle (tinted background) variant,
  radius (6/10/14px), spacing scale (4px base), shadows (subtle, layered).
- **Dark theme by default, light theme via `prefers-color-scheme: light`**, plus a theme toggle
  button in the top bar that sets `data-theme` on `<html>`; remember the choice in localStorage
  (wrap in try/catch).
- Typography: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; mono:
  `ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace`. 14px base,
  tabular numbers for counts/times (`font-variant-numeric: tabular-nums`).
- Generous whitespace, 1px hairline borders, cards with 10–14px radius, no heavy gradients.
  Subtle 120–180ms transitions; respect `prefers-reduced-motion`.
- Visible `:focus-visible` rings everywhere; WCAG AA contrast in both themes.

## Layout
**Top bar** (sticky, blurred translucent background): inline-SVG shield logo + "warden";
a segmented-control tab switcher (**Live** / **Policy**, with `role="tablist"`, `aria-selected`,
and a small amber count badge on Live when approvals are pending); right side: connection
status pill (green dot "Live" when the EventSource is open, grey "Reconnecting…" on error) and
the theme toggle. Content max-width ~1200px, centered, 16px side padding on mobile.

**Warning banner**: full-width amber callout under the top bar with an icon and a dismiss button.

### Live tab
1. **Stat strip** — 4 tiles computed client-side from the loaded audit rows: Total calls,
   Allowed, Denied, Pending approvals. Big tabular number + small label; semantic color accent.
2. **Pending approvals** — section header with count. Each pending item is a card with an amber
   left accent:
   - title `server / tool` (mono), a phase badge ("call" or "flagged result"), "waiting Ns"
     relative time from `createdTs` (updates every second);
   - flags as small red chips;
   - args as a pretty-printed, escaped JSON code block (max-height + scroll);
   - actions: **Approve** (solid green), **Deny** (red outline), and a quieter group
     "Always allow" / "Always deny" (ghost buttons) separated visually.
   - Empty state: a calm illustration-free message with a check icon: "No approvals waiting.
     New requests appear here instantly."
   - Update `document.title` to `(N) warden` when N > 0, else `warden`.
3. **Activity (audit log)** — header with a segmented filter (All / Allowed / Denied — still
   uses the server `decision` filter) and a search input (client-side filter over
   server, tool, reason, flags). Table: sticky header, zebra-free with row hover, columns:
   Time (relative like "2m ago", exact local time in `title`), Server / Tool (mono),
   Decision (pill badge: green allow, red deny), Why (muted), Flags (chips), Duration (right-aligned,
   tabular, "12 ms"). Rows are clickable/keyboard-toggleable (Enter/Space) to expand an inline
   detail row showing escaped pretty args (`r.argsJson`), approval actor + wait, policy verdict
   (`r.policyDecision`), and error if any. Empty state for no rows / no search matches.
   On narrow screens (< 720px) the table collapses into stacked rows (hide Duration/Flags columns
   or reflow) with no horizontal page scroll.

### Policy tab
- Header with a 3-step progress indicator: **1 Edit → 2 Preview → 3 Apply**, highlighting the
  current state (edited-not-previewed / previewed / applied). One-line help text (keep the exact
  sentence "Nothing is saved until you click Apply." somewhere visible).
- Two-column on wide screens (≥ 1000px): left = editor, right = results; stacked on narrow.
- Editor: monospace textarea styled like a code editor (dark surface, line-height 1.6, tab
  inserts two spaces, Ctrl/Cmd+Enter = Preview), an "Unsaved edits" dot indicator when the text
  differs from the loaded file. Buttons: **Preview changes** (primary), **Apply** (success, disabled
  until previewed), **Reload from file** (ghost).
- Results panel:
  - before any preview: an empty state explaining what preview does ("Replays your recorded
    calls against these rules and shows which decisions would change.");
  - after preview: 4 stat tiles (Unchanged, Now allowed, Now denied, Now need approval) plus
    small notes for skipped / approximate when > 0; then a list of changes, each as a row:
    `server / tool` (mono) · `from` badge → `to` badge (colored by decision) · reason (muted) ·
    `rule #i`; if none: a green success callout "No past calls would change. Safe to apply.";
  - errors (YAML/validation/409) in a red callout with the message in a `<pre>` (escaped),
    and success as a green callout + a toast "Applied — warden is using these rules now."
- **Toasts**: small bottom-right stack, auto-dismiss after 4s, `aria-live="polite"`.

## Verify
`npm test`, `npx tsc -p tsconfig.json --noEmit`, `npm run build` all pass.
