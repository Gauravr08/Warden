// NOTE: this file is a TS template literal. Keep the markup free of backticks,
// dollar-brace sequences and backslashes so nothing needs escaping.
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>warden</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z%27 fill=%27%236366f1%27/%3E%3Cpath d=%27m8.5 12 2.5 2.5 4.5-5%27 stroke=%27white%27 stroke-width=%272.2%27 fill=%27none%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E">
<style>
  /* ---- design tokens: dark by default, light via prefers-color-scheme or data-theme ---- */
  :root {
    color-scheme: dark;
    --bg-0: #0a0c11; --bg-1: #11141b; --bg-2: #181c26;
    --border: #262b38; --border-strong: #353c4d;
    --text: #eceef4; --text-2: #aab1c2; --text-3: #8991a6;
    --accent: #8493ff; --accent-solid: #6272f2; --on-accent: #ffffff; --accent-subtle: rgba(132,147,255,.14);
    --success: #4ade9b; --success-solid: #34d399; --on-success: #04150d; --success-subtle: rgba(52,211,153,.13);
    --danger: #ff7b8a; --danger-solid: #ef4458; --danger-subtle: rgba(239,68,88,.14);
    --warning: #f5b94a; --warning-subtle: rgba(245,185,74,.14);
    --info: #6cb6ff; --info-subtle: rgba(108,182,255,.13);
    --code-bg: #07090d;
    --shadow-1: 0 1px 2px rgba(0,0,0,.35);
    --shadow-2: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
    --r-1: 6px; --r-2: 10px; --r-3: 14px;
    --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px;
    --mono: ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --ease: 150ms ease;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      color-scheme: light;
      --bg-0: #f4f5f8; --bg-1: #ffffff; --bg-2: #eef0f5;
      --border: #dfe2ea; --border-strong: #c6cbd8;
      --text: #151823; --text-2: #4a5165; --text-3: #5d6579;
      --accent: #4352d8; --accent-solid: #4352d8; --on-accent: #ffffff; --accent-subtle: rgba(67,82,216,.1);
      --success: #11703f; --success-solid: #15803d; --on-success: #ffffff; --success-subtle: rgba(21,128,61,.1);
      --danger: #b4233a; --danger-solid: #c62a41; --danger-subtle: rgba(198,42,65,.09);
      --warning: #8a5a00; --warning-subtle: rgba(217,150,20,.16);
      --info: #1d5fa8; --info-subtle: rgba(29,95,168,.1);
      --code-bg: #f6f7fa;
      --shadow-1: 0 1px 2px rgba(20,24,40,.08);
      --shadow-2: 0 1px 2px rgba(20,24,40,.06), 0 8px 24px rgba(20,24,40,.12);
    }
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --bg-0: #f4f5f8; --bg-1: #ffffff; --bg-2: #eef0f5;
    --border: #dfe2ea; --border-strong: #c6cbd8;
    --text: #151823; --text-2: #4a5165; --text-3: #5d6579;
    --accent: #4352d8; --accent-solid: #4352d8; --on-accent: #ffffff; --accent-subtle: rgba(67,82,216,.1);
    --success: #11703f; --success-solid: #15803d; --on-success: #ffffff; --success-subtle: rgba(21,128,61,.1);
    --danger: #b4233a; --danger-solid: #c62a41; --danger-subtle: rgba(198,42,65,.09);
    --warning: #8a5a00; --warning-subtle: rgba(217,150,20,.16);
    --info: #1d5fa8; --info-subtle: rgba(29,95,168,.1);
    --code-bg: #f6f7fa;
    --shadow-1: 0 1px 2px rgba(20,24,40,.08);
    --shadow-2: 0 1px 2px rgba(20,24,40,.06), 0 8px 24px rgba(20,24,40,.12);
  }

  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--bg-0); color: var(--text);
    font: 14px/1.5 var(--sans); -webkit-font-smoothing: antialiased;
  }
  button, input, select { font: inherit; color: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .45; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .mono { font-family: var(--mono); }
  .num, .tabular { font-variant-numeric: tabular-nums; }
  [hidden] { display: none !important; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  svg.i { width: 16px; height: 16px; flex: none; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  /* ---- top bar ---- */
  .topbar {
    position: sticky; top: 0; z-index: 20; height: 56px;
    display: flex; align-items: center; gap: var(--s-4); padding: 0 var(--s-4);
    background: var(--bg-0);
    background: color-mix(in srgb, var(--bg-0) 78%, transparent);
    -webkit-backdrop-filter: saturate(1.5) blur(14px); backdrop-filter: saturate(1.5) blur(14px);
    border-bottom: 1px solid var(--border);
  }
  .brand { display: flex; align-items: center; gap: var(--s-2); font-weight: 650; font-size: 16px; letter-spacing: -.01em; }
  .brand svg { width: 22px; height: 22px; color: var(--accent); }
  .seg {
    display: inline-flex; gap: 2px; padding: 3px; background: var(--bg-2);
    border: 1px solid var(--border); border-radius: var(--r-2);
  }
  .seg button {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 0;
    background: transparent; color: var(--text-2); border-radius: 7px; font-weight: 550;
    transition: background var(--ease), color var(--ease);
  }
  .seg button:hover { color: var(--text); }
  .seg button[aria-selected="true"], .seg button[aria-pressed="true"] {
    background: var(--bg-1); color: var(--text); box-shadow: var(--shadow-1), 0 0 0 1px var(--border);
  }
  .badge-count {
    min-width: 18px; padding: 0 6px; border-radius: 9px; font-size: 11px; line-height: 18px; text-align: center;
    font-weight: 700; background: var(--warning); color: #1c1300; font-variant-numeric: tabular-nums;
  }
  .topbar .right { margin-left: auto; display: flex; align-items: center; gap: var(--s-3); }
  .conn {
    display: inline-flex; align-items: center; gap: 7px; padding: 4px 10px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--bg-1); color: var(--text-2); font-size: 12px; font-weight: 550;
  }
  .conn .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); }
  .conn.on { color: var(--success); }
  .conn.on .dot { background: var(--success-solid); box-shadow: 0 0 0 3px var(--success-subtle); }
  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px;
    border: 1px solid var(--border); background: var(--bg-1); color: var(--text-2); border-radius: var(--r-2);
    transition: background var(--ease), color var(--ease), border-color var(--ease);
  }
  .icon-btn:hover { color: var(--text); border-color: var(--border-strong); background: var(--bg-2); }

  /* ---- layout ---- */
  main { max-width: 1200px; margin: 0 auto; padding: var(--s-5) var(--s-4) 64px; }
  .section { margin-top: var(--s-5); }
  .section-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-3); margin-bottom: var(--s-3); }
  .section-head h2 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -.005em; }
  .section-head .count { color: var(--text-3); font-variant-numeric: tabular-nums; font-weight: 500; margin-left: 6px; }
  .section-head .tools { margin-left: auto; display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
  .card { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r-3); box-shadow: var(--shadow-1); }

  /* ---- banner ---- */
  #banner {
    display: flex; align-items: flex-start; gap: var(--s-3); padding: 10px var(--s-4);
    background: var(--warning-subtle); color: var(--warning); border-bottom: 1px solid var(--border);
    font-size: 13px; font-weight: 500;
  }
  #banner .msg { flex: 1; padding-top: 1px; color: var(--text); }
  #banner svg.i { margin-top: 2px; }
  #banner button { background: transparent; border: 0; color: var(--warning); padding: 2px; border-radius: var(--r-1); display: inline-flex; }
  #banner button:hover { background: var(--warning-subtle); }

  /* ---- stat tiles ---- */
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-3); }
  .stat { padding: var(--s-4); position: relative; }
  .stat .label { color: var(--text-2); font-size: 12px; font-weight: 550; text-transform: uppercase; letter-spacing: .05em; }
  .stat .value { font-size: 30px; line-height: 1.15; font-weight: 650; letter-spacing: -.02em; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .stat::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--accent); }
  .stat.ok::before { background: var(--success-solid); } .stat.ok .value { color: var(--success); }
  .stat.bad::before { background: var(--danger-solid); } .stat.bad .value { color: var(--danger); }
  .stat.warn::before { background: var(--warning); } .stat.warn .value { color: var(--warning); }
  .stat.info::before { background: var(--info); }

  /* ---- chips, pills ---- */
  .chips { display: inline-flex; flex-wrap: wrap; gap: 4px; }
  .chip {
    display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
    background: var(--danger-subtle); color: var(--danger); border: 1px solid transparent; white-space: nowrap;
  }
  .pill {
    display: inline-block; padding: 1px 9px; border-radius: 999px; font-size: 12px; font-weight: 650; white-space: nowrap;
  }
  .pill.ok { background: var(--success-subtle); color: var(--success); }
  .pill.bad { background: var(--danger-subtle); color: var(--danger); }
  .pill.warn { background: var(--warning-subtle); color: var(--warning); }
  .pill.info { background: var(--info-subtle); color: var(--info); }
  .pill.muted { background: var(--bg-2); color: var(--text-2); }

  /* ---- pending approvals ---- */
  .pending-list { display: grid; gap: var(--s-3); }
  .pcard { padding: var(--s-4); border-left: 3px solid var(--warning); }
  .pcard-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2) var(--s-3); }
  .pcard-title { font-family: var(--mono); font-size: 14px; font-weight: 650; word-break: break-all; }
  .pcard .wait { margin-left: auto; color: var(--text-2); font-size: 12px; font-variant-numeric: tabular-nums; }
  .pcard .chips { margin-top: var(--s-2); }
  pre.code {
    margin: var(--s-3) 0 0; padding: var(--s-3); max-height: 180px; overflow: auto;
    background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--r-2);
    font: 12.5px/1.55 var(--mono); color: var(--text); white-space: pre-wrap; word-break: break-word;
  }
  .actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2); margin-top: var(--s-3); }
  .actions .grow { flex: 1; }
  .actions .divider { width: 1px; align-self: stretch; background: var(--border); margin: 0 var(--s-2); }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 14px;
    border-radius: var(--r-2); border: 1px solid var(--border-strong); background: var(--bg-2); color: var(--text);
    font-weight: 600; font-size: 13px; transition: background var(--ease), border-color var(--ease), transform var(--ease);
  }
  .btn:hover:not(:disabled) { border-color: var(--text-3); }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn.primary { background: var(--accent-solid); border-color: transparent; color: var(--on-accent); }
  .btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn.success { background: var(--success-solid); border-color: transparent; color: var(--on-success); }
  .btn.success:hover:not(:disabled) { filter: brightness(1.08); }
  .btn.danger-outline { background: transparent; border-color: var(--danger-solid); color: var(--danger); }
  .btn.danger-outline:hover:not(:disabled) { background: var(--danger-subtle); border-color: var(--danger-solid); }
  .btn.ghost { background: transparent; border-color: transparent; color: var(--text-2); font-weight: 550; }
  .btn.ghost:hover:not(:disabled) { background: var(--bg-2); color: var(--text); border-color: transparent; }

  .empty {
    display: flex; flex-direction: column; align-items: center; gap: var(--s-2); text-align: center;
    padding: var(--s-6) var(--s-4); color: var(--text-2);
  }
  .empty svg.i { width: 22px; height: 22px; color: var(--success); }
  .empty.neutral svg.i { color: var(--text-3); }
  .empty .title { color: var(--text); font-weight: 600; }
  .empty p { margin: 0; max-width: 46ch; }

  /* ---- audit table ---- */
  .search {
    height: 32px; width: 220px; max-width: 100%; padding: 0 10px; background: var(--bg-1);
    border: 1px solid var(--border); border-radius: var(--r-2); color: var(--text);
    transition: border-color var(--ease);
  }
  .search::placeholder { color: var(--text-3); }
  .search:hover { border-color: var(--border-strong); }
  .table-card { padding: 0; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
  th {
    position: sticky; top: 56px; z-index: 5; background: var(--bg-1); text-align: left; font-weight: 600; font-size: 12px;
    color: var(--text-2); text-transform: uppercase; letter-spacing: .04em; padding: 10px var(--s-3);
    border-bottom: 1px solid var(--border);
  }
  th:first-child { border-top-left-radius: var(--r-3); } th:last-child { border-top-right-radius: var(--r-3); }
  td { padding: 10px var(--s-3); border-bottom: 1px solid var(--border); vertical-align: middle; }
  tbody tr:last-child td { border-bottom: 0; }
  tr.row { cursor: pointer; transition: background var(--ease); }
  tr.row:hover { background: var(--bg-2); }
  tr.row:focus-visible { outline-offset: -2px; }
  td.t { color: var(--text-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.why { color: var(--text-2); }
  td.dur, th.dur { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.dur { color: var(--text-2); }
  .sep { color: var(--text-3); }
  tr.detail td { background: var(--bg-0); padding: var(--s-4); }
  .kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-3); }
  .kv .k { color: var(--text-3); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
  .kv .v { margin-top: 2px; word-break: break-word; }
  tr.detail pre.code { margin-top: var(--s-3); }

  /* ---- policy ---- */
  .policy-head { display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--s-4); justify-content: space-between; }
  .policy-head h2 { margin: 0 0 4px; font-size: 18px; font-weight: 650; letter-spacing: -.01em; }
  .help { margin: 0; color: var(--text-2); max-width: 62ch; }
  .steps { display: flex; align-items: center; gap: var(--s-2); list-style: none; margin: 0; padding: 0; }
  .steps li { display: flex; align-items: center; gap: var(--s-2); color: var(--text-3); font-weight: 550; font-size: 13px; }
  .steps li + li::before { content: ""; width: 24px; height: 1px; background: var(--border-strong); margin-right: var(--s-1); }
  .steps .n {
    width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--border-strong); font-size: 12px; font-variant-numeric: tabular-nums; transition: all var(--ease);
  }
  .steps li.current { color: var(--text); }
  .steps li.current .n { background: var(--accent-solid); border-color: transparent; color: var(--on-accent); }
  .steps li.done { color: var(--text-2); }
  .steps li.done .n { background: var(--success-subtle); border-color: transparent; color: var(--success); }
  .policy-grid { display: grid; grid-template-columns: 1fr; gap: var(--s-4); margin-top: var(--s-4); align-items: start; }
  @media (min-width: 1000px) { .policy-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  .editor { padding: 0; }
  .editor-bar { border-radius: var(--r-3) var(--r-3) 0 0; }
  textarea#yaml { border-radius: 0; }
  .editor-foot { position: sticky; bottom: 0; z-index: 5; background: var(--bg-1); border-radius: 0 0 var(--r-3) var(--r-3); }
  .editor-bar { display: flex; align-items: center; gap: var(--s-3); padding: 10px var(--s-3); border-bottom: 1px solid var(--border); background: var(--bg-2); }
  .editor-bar .name { font: 12px var(--mono); color: var(--text-2); }
  .unsaved { display: inline-flex; align-items: center; gap: 6px; color: var(--warning); font-size: 12px; font-weight: 600; margin-left: auto; }
  .unsaved::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--warning); }
  textarea#yaml {
    display: block; width: 100%; height: 420px; resize: vertical; border: 0; padding: var(--s-3) var(--s-4);
    background: var(--code-bg); color: var(--text); font: 13px/1.6 var(--mono); tab-size: 2; outline-offset: -2px;
  }
  .editor-foot { display: flex; flex-wrap: wrap; gap: var(--s-2); padding: var(--s-3); border-top: 1px solid var(--border); }
  .hint { color: var(--text-3); font-size: 12px; align-self: center; margin-left: auto; }
  .results { padding: var(--s-4); min-height: 200px; }
  .results .help { font-size: 13px; margin: 0 0 var(--s-3); }
  .results h3 { margin: 0 0 2px; font-size: 15px; font-weight: 650; }
  .results .stats { grid-template-columns: repeat(2, 1fr); }
  .results .stat .value { font-size: 24px; }
  .notes { margin: var(--s-3) 0 0; color: var(--text-2); font-size: 12.5px; display: grid; gap: 2px; }
  .changes { list-style: none; margin: var(--s-3) 0 0; padding: 0; border: 1px solid var(--border); border-radius: var(--r-2); }
  .changes li { padding: 10px var(--s-3); display: grid; gap: 4px; border-bottom: 1px solid var(--border); }
  .changes li:last-child { border-bottom: 0; }
  .changes .line { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2); }
  .changes .arrow { color: var(--text-3); }
  .changes .rule { margin-left: auto; color: var(--text-3); font-size: 12px; font-variant-numeric: tabular-nums; }
  .changes .why { color: var(--text-2); font-size: 12.5px; }
  .callout { display: flex; gap: var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--r-2); border: 1px solid transparent; margin-top: var(--s-3); }
  .callout .body { flex: 1; min-width: 0; }
  .callout svg.i { margin-top: 2px; }
  .callout.err { background: var(--danger-subtle); color: var(--danger); border-color: var(--danger-subtle); }
  .callout.ok { background: var(--success-subtle); color: var(--success); border-color: var(--success-subtle); }
  .callout pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: 12.5px/1.55 var(--mono); }
  #pmsg .callout:first-child { margin-top: var(--s-4); }

  /* ---- simple editor ---- */
  .field {
    display: block; width: 100%; min-height: 36px; padding: 8px 10px; background: var(--bg-1); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--r-1); transition: border-color var(--ease), box-shadow var(--ease);
  }
  .field::placeholder { color: var(--text-3); }
  .field:hover { border-color: var(--border-strong); }
  .field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-subtle); }
  .field[aria-invalid="true"] { border-color: var(--danger-solid); }
  .field.num { width: 90px; }
  #simple { padding: var(--s-4); display: grid; gap: var(--s-5); background: var(--bg-0); }
  .sgroup h3 { margin: 0 0 2px; font-size: 14px; font-weight: 650; }
  .sgroup .help { font-size: 13px; margin-bottom: var(--s-3); }
  .toolbar { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
  .rule { padding: var(--s-3); display: grid; gap: var(--s-3); margin-top: var(--s-3); }
  .rule-head { display: flex; align-items: center; gap: var(--s-2); }
  .rule-head .grow, .limit-line .grow { flex: 1; }
  .rule-head strong { font-weight: 650; }
  .rule-tools { display: flex; gap: var(--s-2); margin-left: auto; }
  select.pillsel { width: auto; min-height: 30px; padding: 3px 10px; border: 1px solid transparent; font-size: 13px; }
  select.pillsel option { background: var(--bg-1); color: var(--text); }
  .rule-sum { color: var(--text-2); font-size: 13px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
  .fld { display: grid; gap: 4px; align-content: start; }
  .fld label { font-size: 12px; font-weight: 600; color: var(--text-2); }
  .conds { display: grid; gap: var(--s-2); }
  .chk { display: flex; align-items: flex-start; gap: var(--s-2); cursor: pointer; min-height: 24px; }
  .chk input { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--accent-solid); }
  .muted { color: var(--text-3); }
  details.more > summary { cursor: pointer; color: var(--text-2); font-weight: 600; font-size: 13px; padding: 4px 0; }
  .argrow { display: grid; grid-template-columns: 1fr auto 1fr auto; gap: var(--s-2); align-items: center; margin-top: var(--s-2); }
  .argrow.ro { grid-template-columns: auto auto 1fr auto auto; font-size: 13px; }
  .hintline { color: var(--text-3); font-size: 12px; margin: var(--s-2) 0; }
  .menu { position: relative; }
  .menu > summary { list-style: none; cursor: pointer; }
  .menu > summary::-webkit-details-marker { display: none; }
  .menu-list {
    position: absolute; z-index: 10; top: 100%; left: 0; margin-top: 4px; min-width: 230px; padding: 4px; display: grid;
    background: var(--bg-1); border: 1px solid var(--border-strong); border-radius: var(--r-2); box-shadow: var(--shadow-2);
  }
  .menu-list .btn { justify-content: flex-start; }
  .roots { list-style: none; margin: 0 0 var(--s-3); padding: 0; display: grid; gap: var(--s-2); }
  .roots li { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); padding: 4px 4px 4px 10px; background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--r-1); }
  .roots code { word-break: break-all; }
  .addrow { display: flex; gap: var(--s-2); }
  .limit-line { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
  .limit-line label { font-size: 13px; color: var(--text-2); }
  .empty-card { margin-top: var(--s-3); }

  /* ---- toasts ---- */
  #toasts { position: fixed; right: var(--s-4); bottom: var(--s-4); z-index: 50; display: grid; gap: var(--s-2); max-width: calc(100vw - 32px); }
  .toast {
    display: flex; align-items: center; gap: var(--s-2); padding: 10px var(--s-4); background: var(--bg-2);
    border: 1px solid var(--border-strong); border-radius: var(--r-2); box-shadow: var(--shadow-2); font-weight: 550;
    animation: toast-in 180ms ease;
  }
  .toast svg.i { color: var(--success); }
  @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

  /* ---- responsive ---- */
  @media (max-width: 720px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .topbar { gap: var(--s-2); }
    .brand .name, .conn .txt { display: none; }
    .conn { padding: 6px; }
    .section-head .tools { margin-left: 0; width: 100%; }
    .search { flex: 1; width: auto; }
    th.c-flags, td.c-flags, th.dur, td.dur { display: none; }
    table { table-layout: fixed; }
    td, th { padding: 9px var(--s-2); }
    td.mono, td.why { word-break: break-word; }
    .steps li span.lbl { display: none; }
    .steps li.current span.lbl { display: inline; }
    .hint { display: none; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; }
    .actions .grow, .actions .divider { display: none; }
    .actions .btn { width: 100%; justify-content: center; }
    .pair { grid-template-columns: 1fr; }
    .field { min-height: 40px; }
    .icon-btn { width: 40px; height: 40px; }
    .rule-head { flex-wrap: wrap; }
    .rule-tools { width: 100%; justify-content: flex-end; }
    .argrow { grid-template-columns: 1fr; }
    .argrow .icon-btn { justify-self: end; }
    .rule .btn, #simple .btn { min-height: 40px; }
    select.pillsel { min-height: 40px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; }
  }
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3z" fill="currentColor" fill-opacity=".14"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>
    <span class="name">warden</span>
  </div>
  <div class="seg" role="tablist" aria-label="Sections">
    <button role="tab" id="tab-live" aria-selected="true" aria-controls="live">Live <span class="badge-count" id="live-badge" hidden>0</span></button>
    <button role="tab" id="tab-policy" aria-selected="false" aria-controls="policy">Policy</button>
  </div>
  <div class="right">
    <span class="conn" id="conn" role="status"><span class="dot"></span><span class="txt" id="conn-txt">Connecting&hellip;</span></span>
    <button class="icon-btn" id="theme" title="Toggle theme" aria-label="Toggle theme"></button>
  </div>
</header>

<div id="banner" role="alert" hidden>
  <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
  <span class="msg" id="banner-msg"></span>
  <button id="banner-x" title="Dismiss" aria-label="Dismiss warning"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
</div>

<main id="live" role="tabpanel" aria-labelledby="tab-live">
  <div class="stats" id="stats"></div>

  <section class="section">
    <div class="section-head"><h2>Pending approvals<span class="count" id="pending-count"></span></h2></div>
    <div id="pending" class="pending-list"></div>
  </section>

  <section class="section">
    <div class="section-head">
      <h2>Activity</h2>
      <div class="tools">
        <div class="seg" id="decision" role="group" aria-label="Filter by decision">
          <button type="button" data-v="" aria-pressed="true">All</button>
          <button type="button" data-v="allow" aria-pressed="false">Allowed</button>
          <button type="button" data-v="deny" aria-pressed="false">Denied</button>
        </div>
        <input class="search" id="search" type="search" placeholder="Search server, tool, reason&hellip;" aria-label="Search activity" autocomplete="off">
      </div>
    </div>
    <div class="card table-card">
      <table>
        <thead><tr>
          <th>Time</th><th>Server / Tool</th><th>Decision</th><th>Why</th><th class="c-flags">Flags</th><th class="dur">Duration</th>
        </tr></thead>
        <tbody id="audit"></tbody>
      </table>
      <div id="audit-empty"></div>
    </div>
  </section>
</main>

<main id="policy" role="tabpanel" aria-labelledby="tab-policy" hidden>
  <div class="policy-head">
    <div>
      <h2>Policy</h2>
      <p class="help">Edit your rules, preview what would have changed against your recorded history, then apply. Nothing is saved until you click Apply.</p>
    </div>
    <ol class="steps" id="steps" aria-label="Progress">
      <li data-step="1"><span class="n">1</span><span class="lbl">Edit</span></li>
      <li data-step="2"><span class="n">2</span><span class="lbl">Preview</span></li>
      <li data-step="3"><span class="n">3</span><span class="lbl">Apply</span></li>
    </ol>
  </div>
  <div id="pmsg" aria-live="polite"></div>
  <div class="policy-grid">
    <div class="card editor">
      <div class="editor-bar">
        <div class="seg" id="mode" role="group" aria-label="Editor mode">
          <button type="button" data-v="simple" aria-pressed="true">Simple</button>
          <button type="button" data-v="yaml" aria-pressed="false">YAML</button>
        </div>
        <span class="name" id="fname" hidden>warden.yaml</span>
        <span class="unsaved" id="unsaved" hidden>Unsaved edits</span>
      </div>
      <div id="simple"></div>
      <textarea id="yaml" spellcheck="false" aria-label="Policy YAML" hidden></textarea>
      <div class="editor-foot">
        <button class="btn primary" id="preview">Preview changes</button>
        <button class="btn success" id="apply" disabled>Apply</button>
        <button class="btn ghost" id="reload">Reload from file</button>
        <span class="hint">Ctrl/Cmd + Enter to preview</span>
      </div>
    </div>
    <div class="card results" id="presult"></div>
  </div>
</main>

<div id="toasts" aria-live="polite"></div>

<script>
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ---- icons (inline SVG, static markup only) ----
const ICONS = {
  check: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  inbox: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/></svg>',
  search: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  play: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16l14-8z"/></svg>',
  sun: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  up: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
  down: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  copy: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  trash: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  moon: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};

// ---- theme ----
function effectiveTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t) return t;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function paintThemeIcon() {
  $("theme").innerHTML = effectiveTheme() === "light" ? ICONS.moon : ICONS.sun;
}
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("warden-theme", t); } catch (e) { /* storage unavailable */ }
  paintThemeIcon();
}
(function initTheme() {
  try {
    const t = localStorage.getItem("warden-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* storage unavailable */ }
  paintThemeIcon();
})();
$("theme").onclick = () => setTheme(effectiveTheme() === "light" ? "dark" : "light");

// ---- helpers ----
function decClass(d) { return d === "allow" ? "ok" : d === "deny" ? "bad" : "warn"; }

function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

function waitText(created) {
  const s = Math.max(0, Math.floor((Date.now() - created) / 1000));
  return "waiting " + (s < 60 ? s + "s" : Math.floor(s / 60) + "m " + (s % 60) + "s");
}

function prettyJson(str) {
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch (e) { return String(str); }
}

function chips(list) {
  return list.length
    ? '<span class="chips">' + list.map((f) => '<span class="chip">' + esc(f) + "</span>").join("") + "</span>"
    : "";
}

function emptyState(icon, title, text, neutral) {
  return '<div class="empty' + (neutral ? " neutral" : "") + '">' + ICONS[icon] +
    '<div class="title">' + esc(title) + "</div><p>" + esc(text) + "</p></div>";
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = ICONS.check + "<span>" + esc(msg) + "</span>";
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ---- stat strip ----
function tile(label, value, cls) {
  return '<div class="card stat ' + cls + '"><div class="label">' + esc(label) +
    '</div><div class="value">' + esc(value) + "</div></div>";
}

function renderStats(rows, pendingCount) {
  const allowed = rows.filter((r) => r.decision === "allow").length;
  const denied = rows.filter((r) => r.decision === "deny").length;
  $("stats").innerHTML =
    tile("Total calls", rows.length, "info") + tile("Allowed", allowed, "ok") +
    tile("Denied", denied, "bad") + tile("Pending approvals", pendingCount, "warn");
}

// ---- pending approvals ----
async function act(id, action) {
  await fetch("/api/pending/" + encodeURIComponent(id), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  refresh();
}

function card(p) {
  const phase = p.phase === "result" ? "flagged result" : "call";
  const flags = p.flags.length
    ? '<div title="' + esc(p.flags.join(", ")) + '">' + chips(p.flags) + "</div>"
    : "";
  return '<article class="card pcard" data-id="' + esc(p.id) + '">' +
    '<div class="pcard-head"><span class="pcard-title">' + esc(p.server) + " / " + esc(p.tool) + "</span>" +
    '<span class="pill warn">' + esc(phase) + "</span>" +
    '<span class="wait" data-created="' + esc(p.createdTs) + '">' + esc(waitText(p.createdTs)) + "</span></div>" +
    flags +
    '<pre class="code">' + esc(JSON.stringify(p.args, null, 2)) + "</pre>" +
    '<div class="actions">' +
    '<button class="btn success" data-act="approve">Approve</button>' +
    '<button class="btn danger-outline" data-act="deny">Deny</button>' +
    '<span class="grow"></span><span class="divider"></span>' +
    '<button class="btn ghost" data-act="always_allow">Always allow</button>' +
    '<button class="btn ghost" data-act="always_deny">Always deny</button>' +
    "</div></article>";
}

function renderPending(pending) {
  $("pending").innerHTML = pending.length
    ? pending.map(card).join("")
    : '<div class="card">' + emptyState("check", "No approvals waiting.", "New requests appear here instantly.") + "</div>";
  $("pending-count").textContent = pending.length ? "(" + pending.length + ")" : "";
  const badge = $("live-badge");
  badge.textContent = pending.length;
  badge.hidden = pending.length === 0;
  document.title = pending.length ? "(" + pending.length + ") warden" : "warden";
}

$("pending").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const c = btn.closest(".pcard");
  if (c) act(c.getAttribute("data-id"), btn.getAttribute("data-act"));
});

function tickWaits() {
  document.querySelectorAll(".wait[data-created]").forEach((el) => {
    el.textContent = waitText(Number(el.getAttribute("data-created")));
  });
}
setInterval(tickWaits, 1000);

// ---- activity table ----
let auditRows = [];
let decisionFilter = "";
let searchText = "";
const expanded = new Set();

function matchesSearch(r) {
  if (!searchText) return true;
  const hay = [r.server, r.tool, r.reason || "", r.flags.join(" ")].join(" ").toLowerCase();
  return hay.indexOf(searchText) !== -1;
}

function kv(k, v) {
  return '<div><div class="k">' + esc(k) + '</div><div class="v">' + v + "</div></div>";
}

function detailRow(r) {
  const items = [];
  if (r.approvalActor != null) {
    items.push(kv("Approval", esc(r.approvalActor) + (r.approvalMs != null ? " after " + esc(r.approvalMs) + " ms" : "")));
  }
  if (r.policyDecision != null) items.push(kv("Policy verdict", '<span class="pill ' + decClass(r.policyDecision) + '">' + esc(r.policyDecision) + "</span>"));
  if (r.ruleIndex != null) items.push(kv("Rule", "#" + esc(r.ruleIndex)));
  if (r.error) items.push(kv("Error", '<span style="color:var(--danger)">' + esc(r.error) + "</span>"));
  return '<tr class="detail"><td colspan="6">' +
    (items.length ? '<div class="kv">' + items.join("") + "</div>" : "") +
    '<pre class="code">' + esc(prettyJson(r.argsJson)) + "</pre></td></tr>";
}

function auditRow(r) {
  const open = expanded.has(r.id);
  const why = r.reason ? esc(r.reason) : (r.ruleIndex != null ? "rule #" + esc(r.ruleIndex) : "");
  const dur = r.durationMs == null ? "" : esc(r.durationMs) + " ms";
  return '<tr class="row" tabindex="0" role="button" aria-expanded="' + open + '" data-id="' + esc(r.id) + '">' +
    '<td class="t" title="' + esc(new Date(r.ts).toLocaleString()) + '">' + esc(ago(r.ts)) + "</td>" +
    '<td class="mono">' + esc(r.server) + ' <span class="sep">/</span> ' + esc(r.tool) + "</td>" +
    '<td><span class="pill ' + decClass(r.decision) + '">' + esc(r.decision) + "</span></td>" +
    '<td class="why">' + why + "</td>" +
    '<td class="c-flags" title="' + esc(r.flags.join(", ")) + '">' + chips(r.flags) + "</td>" +
    '<td class="dur">' + dur + "</td></tr>" + (open ? detailRow(r) : "");
}

function renderAudit() {
  const rows = auditRows.filter(matchesSearch);
  $("audit").innerHTML = rows.map(auditRow).join("");
  $("audit-empty").innerHTML = rows.length ? "" : (auditRows.length
    ? emptyState("search", "No matching activity", "Try a different search or filter.", true)
    : emptyState("inbox", "No activity yet", "Tool calls through warden will show up here.", true));
}

function toggleRow(id) {
  if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
  renderAudit();
  const tr = Array.prototype.find.call(document.querySelectorAll("tr.row"), (el) => el.getAttribute("data-id") === id);
  if (tr) tr.focus();
}

$("audit").addEventListener("click", (ev) => {
  const tr = ev.target.closest("tr.row");
  if (tr) toggleRow(tr.getAttribute("data-id"));
});
$("audit").addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  const tr = ev.target.closest("tr.row");
  if (!tr) return;
  ev.preventDefault();
  toggleRow(tr.getAttribute("data-id"));
});

$("search").oninput = () => { searchText = $("search").value.trim().toLowerCase(); renderAudit(); };

$("decision").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-v]");
  if (!b) return;
  decisionFilter = b.getAttribute("data-v");
  document.querySelectorAll("#decision button").forEach((x) => {
    x.setAttribute("aria-pressed", String(x === b));
  });
  refresh();
});

async function refresh() {
  try {
    const pending = await (await fetch("/api/pending")).json();
    renderPending(pending);
    const q = decisionFilter ? "?decision=" + encodeURIComponent(decisionFilter) : "";
    auditRows = await (await fetch("/api/audit" + q)).json();
    // stats describe everything, not just the filtered view
    const all = decisionFilter ? await (await fetch("/api/audit")).json() : auditRows;
    renderStats(all, pending.length);
    renderAudit();
  } catch (e) { /* server briefly unreachable; the next poll retries */ }
}

// ---- warning banner (SSE "warning" events, e.g. a broken manual edit) ----
function warn(msg) {
  $("banner-msg").innerHTML = esc(msg);
  $("banner").hidden = false;
}
$("banner-x").onclick = () => { $("banner").hidden = true; };

// ---- tabs ----
let policyLoaded = false;
function showTab(name) {
  $("live").hidden = name !== "live";
  $("policy").hidden = name !== "policy";
  $("tab-live").setAttribute("aria-selected", String(name === "live"));
  $("tab-policy").setAttribute("aria-selected", String(name === "policy"));
  if (name === "policy" && !policyLoaded) loadPolicy();
}
$("tab-live").onclick = () => showTab("live");
$("tab-policy").onclick = () => showTab("policy");

// ---- policy editor: edit -> preview -> apply ----
let loadedHash = null;
let loadedText = "";
let previewedText = null;
let justApplied = false;

let mode = "simple";
try { if (localStorage.getItem("warden-policy-mode") === "yaml") mode = "yaml"; } catch (e) { /* storage unavailable */ }
let rules = { defaults: { action: "approve" }, policies: [], limits: [], allowed_roots: [] };
let catalog = { servers: {} };
let loadedRulesText = "";
let syncedRules = null;
let newRoot = "";
let pendingFocus = "";

function cleanMatch(m) {
  const o = {};
  if (m.server) o.server = m.server;
  if (m.tool) o.tool = m.tool;
  if (m.args) {
    const a = {};
    Object.keys(m.args).forEach((k) => { if (k) a[k] = m.args[k]; });
    if (Object.keys(a).length) o.args = a;
  }
  if (m.args_contain_secret !== undefined) o.args_contain_secret = m.args_contain_secret;
  if (m.result_has_injection !== undefined) o.result_has_injection = m.result_has_injection;
  return o;
}
function cleanRules(r) {
  return {
    defaults: { action: r.defaults.action },
    policies: r.policies.map((p) => ({ match: cleanMatch(p.match || {}), action: p.action })),
    limits: r.limits.map((l) => ({ match: cleanMatch(l.match || {}), max_calls_per_hour: l.max_calls_per_hour })),
    allowed_roots: r.allowed_roots.slice(),
  };
}
function curText() { return mode === "simple" ? JSON.stringify(cleanRules(rules)) : $("yaml").value; }
function payload() { return mode === "simple" ? { rules: cleanRules(rules) } : { yaml: $("yaml").value }; }

function syncApply() {
  const text = curText();
  const dirty = mode === "simple" ? text !== loadedRulesText : text !== loadedText;
  $("apply").disabled = previewedText === null || text !== previewedText;
  $("unsaved").hidden = !dirty;
  const step = justApplied && !dirty ? 3 : (previewedText !== null && text === previewedText ? 2 : 1);
  document.querySelectorAll("#steps li").forEach((li) => {
    const n = Number(li.getAttribute("data-step"));
    li.className = n < step || (step === 3 && n === 3) ? "done" : (n === step ? "current" : "");
    if (n === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
  });
}

function callout(kind, bodyHtml) {
  return '<div class="callout ' + kind + '">' + (kind === "ok" ? ICONS.check : ICONS.alert) +
    '<div class="body">' + bodyHtml + "</div></div>";
}
function errBox(escapedHtml) { return callout("err", "<pre>" + escapedHtml + "</pre>"); }
function say(kind, msg) { $("pmsg").innerHTML = callout(kind, "<pre>" + esc(msg) + "</pre>"); }

function resultsPlaceholder() {
  $("presult").innerHTML = emptyState("play", "Preview your changes",
    "Replays your recorded calls against these rules and shows which decisions would change.", true);
}

// ---- simple editor ----
const ACTIONS = [["allow", "Allow", "ok"], ["approve", "Ask me", "warn"], ["deny", "Block", "bad"]];
const DEFAULT_HELP = {
  allow: "Calls that no rule covers go through.",
  approve: "You are asked before anything that no rule covers runs.",
  deny: "Anything that no rule covers is blocked.",
};
const TEMPLATES = [
  ["secrets", "Block secrets everywhere"],
  ["allow", "Allow a tool"],
  ["ask", "Ask before a tool"],
  ["block", "Block a tool"],
];

function flag(o, k, v) {
  if (v) Object.defineProperty(o, k, { value: true, writable: true, configurable: true, enumerable: false });
  else delete o[k];
}
function setKey(o, k, v) { if (v === "" || v === undefined) delete o[k]; else o[k] = v; }
function allTools() {
  const s = {};
  Object.keys(catalog.servers).forEach((n) => catalog.servers[n].forEach((t) => { s[t] = 1; }));
  return Object.keys(s).sort();
}
function actionClass(a) { return ACTIONS.filter((x) => x[0] === a)[0][2]; }

function targetText(m0) {
  const m = { server: m0.server === "*" ? "" : m0.server, tool: m0.tool === "*" ? "" : m0.tool };
  if (m.server && m.tool) return m.server + " › " + m.tool;
  if (m.tool) return m.tool + " on any server";
  if (m.server) return "any tool on " + m.server;
  return "any tool on any server";
}
function summary(p) {
  const m = p.match;
  const cs = [];
  if (m.args_contain_secret === true) cs.push("it contains a secret");
  if (m.args_contain_secret === false) cs.push("it does not contain a secret");
  if (m.result_has_injection === true) cs.push("the tool's reply looks like a prompt injection");
  if (m.result_has_injection === false) cs.push("the tool's reply does not look like a prompt injection");
  Object.keys(m.args || {}).forEach((k) => {
    if (!k) return;
    cs.push(k + " matches " + (typeof m.args[k] === "string" ? m.args[k] : "a custom value"));
  });
  const verb = p.action === "approve" ? "Ask me before " : (p.action === "deny" ? "Block " : "Allow ");
  return verb + targetText(m) + (cs.length ? " when " + cs.join(" and ") : "") + ".";
}

function pick(id, label, val, list, other, f) {
  if (val === "*" && !other) val = "";
  const isOther = other || (val && list.indexOf(val) === -1);
  let h = '<div class="fld"><label for="' + id + '">' + label + '</label><select class="field" id="' + id + '" data-f="' + f + '-sel">' +
    '<option value=""' + (!val && !isOther ? " selected" : "") + ">Any " + label.toLowerCase() + "</option>";
  list.forEach((x) => {
    h += '<option value="' + esc(x) + '"' + (!isOther && x === val ? " selected" : "") + ">" + esc(x) + "</option>";
  });
  h += '<option value="__other__"' + (isOther ? " selected" : "") + ">Other&hellip;</option></select>";
  if (isOther) {
    h += '<input class="field" id="' + id + '-x" data-f="' + f + '" aria-label="' + label + ' name or pattern" ' +
      'placeholder="e.g. git*" value="' + esc(val || "") + '" autocomplete="off">';
  }
  return h + "</div>";
}
function pairHtml(k, i, m) {
  const tools = (m.server && catalog.servers[m.server]) || allTools();
  return '<div class="pair">' + pick(k + i + "-server", "Server", m.server, Object.keys(catalog.servers), m._os, "server") +
    pick(k + i + "-tool", "Tool", m.tool, tools, m._ot, "tool") + "</div>";
}

function tri(id, f, val, label) {
  return '<label class="chk" for="' + id + '"><input type="checkbox" id="' + id + '" data-f="' + f + '" data-st="' +
    (val === true ? "1" : (val === false ? "0" : "")) + '"' + (val === true ? " checked" : "") + "><span>" + label +
    (val === false ? ' <em class="muted">' + "(set to 'not' in YAML)" + "</em>" : "") + "</span></label>";
}

function iconBtn(op, label, icon, extra) {
  return '<button type="button" class="icon-btn" data-op="' + op + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' +
    (extra || "") + ">" + ICONS[icon] + "</button>";
}

function argRows(m) {
  const a = m.args || {};
  return Object.keys(a).map((name, j) => {
    if (typeof a[name] !== "string") {
      return '<div class="argrow ro"><code>' + esc(name) + '</code><span class="muted">matches</span><code>' +
        esc(JSON.stringify(a[name])) + '</code><span class="muted">edit in YAML</span>' +
        iconBtn("delarg", "Remove condition", "x", ' data-j="' + j + '"') + "</div>";
    }
    return '<div class="argrow"><input class="field" data-f="argname" data-j="' + j + '" value="' + esc(name) +
      '" aria-label="Argument name" placeholder="argument name" autocomplete="off"><span class="muted">matches</span>' +
      '<input class="field" data-f="argval" data-j="' + j + '" value="' + esc(a[name]) +
      '" aria-label="Pattern" placeholder="pattern" autocomplete="off">' +
      iconBtn("delarg", "Remove condition", "x", ' data-j="' + j + '"') + "</div>";
  }).join("");
}

function ruleCard(p, i, n) {
  const m = p.match;
  const id = "p" + i;
  const opts = ACTIONS.map((a) => '<option value="' + a[0] + '"' + (p.action === a[0] ? " selected" : "") + ">" + a[1] + "</option>").join("");
  return '<div class="card rule" data-k="p" data-i="' + i + '">' +
    '<div class="rule-head"><strong>Rule ' + (i + 1) + "</strong>" +
    '<select class="pill pillsel ' + actionClass(p.action) + '" id="' + id + '-action" data-f="action" aria-label="Rule ' + (i + 1) + ' action">' + opts + "</select>" +
    '<span class="rule-tools">' +
    iconBtn("up", "Move rule " + (i + 1) + " up", "up", ' id="' + id + '-up"' + (i === 0 ? " disabled" : "")) +
    iconBtn("down", "Move rule " + (i + 1) + " down", "down", ' id="' + id + '-down"' + (i === n - 1 ? " disabled" : "")) +
    iconBtn("dup", "Duplicate rule " + (i + 1), "copy", ' id="' + id + '-dup"') +
    iconBtn("del", "Delete rule " + (i + 1), "trash", ' id="' + id + '-del"') + "</span></div>" +
    '<div class="rule-sum">' + esc(summary(p)) + "</div>" +
    pairHtml("p", i, m) +
    '<div class="conds">' +
    tri(id + "-secret", "secret", m.args_contain_secret, "Only if it contains a secret or a file path outside your allowed folders") +
    tri(id + "-inj", "inj", m.result_has_injection, "Only if the tool's reply looks like a prompt injection") + "</div>" +
    '<details class="more" data-key="' + id + '"><summary>More conditions</summary>' +
    argRows(m) +
    '<div class="hintline">e.g. path matches ~/projects/**</div>' +
    '<button type="button" class="btn ghost" data-op="addarg" id="' + id + '-addarg">+ Add condition</button></details></div>';
}

function defaultsHtml() {
  const d = rules.defaults.action;
  return '<section class="sgroup"><h3>When no rule matches</h3><p class="help">' + esc(DEFAULT_HELP[d]) + "</p>" +
    '<div class="seg" role="group" aria-label="When no rule matches">' +
    ACTIONS.map((a) => '<button type="button" data-op="default" data-v="' + a[0] + '" aria-pressed="' + (d === a[0]) + '">' + a[1] + "</button>").join("") +
    "</div></section>";
}
function rulesHtml() {
  const n = rules.policies.length;
  return '<section class="sgroup"><h3>Rules</h3>' +
    '<p class="help">Checked top to bottom; the first rule that fits decides. Block rules about secrets always win.</p>' +
    '<div class="toolbar"><button type="button" class="btn" data-op="addrule" id="addrule">+ Add rule</button>' +
    '<details class="menu"><summary class="btn">Add from template</summary><div class="menu-list">' +
    TEMPLATES.map((t) => '<button type="button" class="btn ghost" data-op="tmpl" data-v="' + t[0] + '">' + t[1] + "</button>").join("") +
    "</div></details></div>" +
    (n ? rules.policies.map((p, i) => ruleCard(p, i, n)).join("")
       : '<div class="card empty-card">' + emptyState("inbox", "No rules yet", "Add a rule to allow, ask about or block specific tools.", true) + "</div>") +
    "</section>";
}
function rootsHtml() {
  return '<section class="sgroup"><h3>Allowed folders</h3>' +
    '<p class="help">Requests that point at files outside these folders are treated like secrets. Leave empty to skip the check.</p>' +
    (rules.allowed_roots.length
      ? '<ul class="roots">' + rules.allowed_roots.map((r, i) =>
        "<li><code>" + esc(r) + "</code>" + iconBtn("delroot", "Remove folder " + r, "x", ' data-i="' + i + '"') + "</li>").join("") + "</ul>"
      : "") +
    '<div class="addrow"><label class="sr-only" for="newroot">Folder path</label>' +
    '<input class="field" id="newroot" placeholder="e.g. ~/projects" value="' + esc(newRoot) + '" autocomplete="off">' +
    '<button type="button" class="btn" data-op="addroot">Add</button></div></section>';
}
function limitsHtml() {
  return '<section class="sgroup"><h3>Rate limits</h3><p class="help">Allowed calls beyond this are blocked.</p>' +
    rules.limits.map((l, i) =>
      '<div class="card rule" data-k="l" data-i="' + i + '">' + pairHtml("l", i, l.match) +
      '<div class="limit-line"><label for="l' + i + '-max">At most</label>' +
      '<input class="field num" type="number" min="1" step="1" id="l' + i + '-max" data-f="max" value="' +
      esc(l.max_calls_per_hour === undefined ? "" : l.max_calls_per_hour) + '"><span>calls per hour</span><span class="grow"></span>' +
      iconBtn("dellimit", "Remove limit " + (i + 1), "x") + "</div></div>").join("") +
    '<div class="toolbar"><button type="button" class="btn" data-op="addlimit">+ Add limit</button></div></section>';
}

function renderSimple() {
  const root = $("simple");
  const active = pendingFocus || (document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : "");
  pendingFocus = "";
  const open = {};
  root.querySelectorAll("details.more").forEach((d) => { open[d.getAttribute("data-key")] = d.open; });
  const top = root.scrollTop;
  root.innerHTML = defaultsHtml() + rulesHtml() + rootsHtml() + limitsHtml();
  root.querySelectorAll('input[data-st="0"]').forEach((e) => { e.indeterminate = true; });
  root.querySelectorAll("details.more").forEach((d) => { if (open[d.getAttribute("data-key")]) d.open = true; });
  root.scrollTop = top;
  if (active) {
    const el = $(active);
    if (el && !el.disabled) el.focus();
  }
}
function touched() { justApplied = false; renderSimple(); syncApply(); }

function matchOf(k, i) { return k === "p" ? rules.policies[i].match : rules.limits[i].match; }

$("simple").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-op]");
  if (!b) return;
  const op = b.getAttribute("data-op");
  const c = b.closest("[data-k]");
  const k = c ? c.getAttribute("data-k") : "";
  const i = c ? Number(c.getAttribute("data-i")) : -1;
  const ps = rules.policies;
  if (op === "default") rules.defaults.action = b.getAttribute("data-v");
  else if (op === "up" || op === "down") {
    const j = op === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= ps.length) return;
    const t = ps[i]; ps[i] = ps[j]; ps[j] = t;
    const more = op === "up" ? j > 0 : j < ps.length - 1;
    pendingFocus = "p" + j + "-" + (more ? op : (op === "up" ? "down" : "up"));
  } else if (op === "dup") {
    ps.splice(i + 1, 0, JSON.parse(JSON.stringify(ps[i])));
    pendingFocus = "p" + (i + 1) + "-dup";
  } else if (op === "del") ps.splice(i, 1);
  else if (op === "addrule") {
    ps.push({ match: {}, action: "approve" });
    pendingFocus = "p" + (ps.length - 1) + "-server";
  } else if (op === "tmpl") {
    const t = b.getAttribute("data-v");
    if (t === "secrets") { ps.unshift({ match: { args_contain_secret: true }, action: "deny" }); pendingFocus = "p0-server"; }
    else {
      ps.push({ match: {}, action: t === "allow" ? "allow" : (t === "ask" ? "approve" : "deny") });
      pendingFocus = "p" + (ps.length - 1) + "-server";
    }
  } else if (op === "addarg") {
    const m = matchOf(k, i);
    const a = m.args || {};
    if (!("" in a)) a[""] = "";
    m.args = a;
    c.querySelector("details.more").open = true;
    renderSimple();
    const rows = $("simple").querySelectorAll('[data-k="p"][data-i="' + i + '"] input[data-f="argname"]');
    for (let x = 0; x < rows.length; x++) if (rows[x].value === "") rows[x].focus();
    justApplied = false;
    syncApply();
    return;
  } else if (op === "delarg") {
    const m = matchOf(k, i);
    delete m.args[Object.keys(m.args)[Number(b.getAttribute("data-j"))]];
  } else if (op === "addroot") {
    const v = $("newroot").value.trim();
    if (!v) return;
    if (rules.allowed_roots.indexOf(v) === -1) rules.allowed_roots.push(v);
    newRoot = "";
    pendingFocus = "newroot";
  } else if (op === "delroot") rules.allowed_roots.splice(Number(b.getAttribute("data-i")), 1);
  else if (op === "addlimit") {
    rules.limits.push({ match: {}, max_calls_per_hour: 100 });
    pendingFocus = "l" + (rules.limits.length - 1) + "-server";
  } else if (op === "dellimit") rules.limits.splice(i, 1);
  else return;
  touched();
});

$("simple").addEventListener("input", (ev) => {
  const e = ev.target;
  if (e.id === "newroot") { newRoot = e.value; return; }
  const f = e.getAttribute("data-f");
  const c = e.closest("[data-k]");
  if (!f || !c) return;
  const k = c.getAttribute("data-k");
  const i = Number(c.getAttribute("data-i"));
  const m = matchOf(k, i);
  if (f === "server" || f === "tool") setKey(m, f, e.value.trim());
  else if (f === "max") {
    if (e.value === "") delete rules.limits[i].max_calls_per_hour;
    else rules.limits[i].max_calls_per_hour = Number(e.value);
  } else if (f === "argname") {
    const a = m.args;
    const keys = Object.keys(a);
    const j = Number(e.getAttribute("data-j"));
    if (e.value !== keys[j] && keys.indexOf(e.value) !== -1) { e.setAttribute("aria-invalid", "true"); return; }
    e.removeAttribute("aria-invalid");
    const o = {};
    keys.forEach((kk, x) => { o[x === j ? e.value : kk] = a[kk]; });
    m.args = o;
  } else if (f === "argval") {
    const keys = Object.keys(m.args);
    m.args[keys[Number(e.getAttribute("data-j"))]] = e.value;
  } else return;
  if (k === "p") c.querySelector(".rule-sum").textContent = summary(rules.policies[i]);
  justApplied = false;
  syncApply();
});

$("simple").addEventListener("change", (ev) => {
  const e = ev.target;
  const f = e.getAttribute("data-f");
  const c = e.closest("[data-k]");
  if (!f || !c) return;
  const k = c.getAttribute("data-k");
  const i = Number(c.getAttribute("data-i"));
  const m = matchOf(k, i);
  if (f === "action") rules.policies[i].action = e.value;
  else if (f === "secret") setKey(m, "args_contain_secret", e.checked ? true : undefined);
  else if (f === "inj") setKey(m, "result_has_injection", e.checked ? true : undefined);
  else if (f === "server-sel") {
    if (e.value === "__other__") { delete m.server; flag(m, "_os", true); pendingFocus = e.id + "-x"; }
    else {
      flag(m, "_os", false);
      setKey(m, "server", e.value);
      if (e.value && m.tool && !m._ot && allTools().indexOf(m.tool) !== -1 && (catalog.servers[e.value] || []).indexOf(m.tool) === -1) delete m.tool;
    }
  } else if (f === "tool-sel") {
    if (e.value === "__other__") { delete m.tool; flag(m, "_ot", true); pendingFocus = e.id + "-x"; }
    else { flag(m, "_ot", false); setKey(m, "tool", e.value); }
  } else return;
  touched();
});

$("simple").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); $("preview").click(); return; }
  if (ev.key === "Enter" && ev.target.id === "newroot") {
    ev.preventDefault();
    const b = $("simple").querySelector('[data-op="addroot"]');
    if (b) b.click();
  }
});

function paintMode() {
  $("simple").hidden = mode !== "simple";
  $("yaml").hidden = mode !== "yaml";
  $("fname").hidden = mode === "simple";
  document.querySelectorAll("#mode button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === mode));
  });
  if (mode === "simple") renderSimple();
}

async function setMode(next) {
  if (next === mode) return;
  try {
    if (next === "yaml") {
      if (curText() !== syncedRules) $("yaml").value = (await pcall("/api/policy/render", { rules: cleanRules(rules) })).yaml;
    } else {
      rules = (await pcall("/api/policy/parse", { yaml: $("yaml").value })).rules;
      syncedRules = JSON.stringify(cleanRules(rules));
    }
  } catch (e) {
    $("pmsg").innerHTML = errBox(esc(e.message));
    return;
  }
  $("pmsg").innerHTML = "";
  mode = next;
  try { localStorage.setItem("warden-policy-mode", mode); } catch (e) { /* storage unavailable */ }
  previewedText = null;
  resultsPlaceholder();
  paintMode();
  syncApply();
}
$("mode").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-v]");
  if (b) setMode(b.getAttribute("data-v"));
});

async function loadPolicy() {
  resultsPlaceholder();
  previewedText = null;
  justApplied = false;
  try {
    const r = await fetch("/api/policy");
    if (!r.ok) throw new Error(r.status === 404 ? "Policy editing is not available (no config file)." : "HTTP " + r.status);
    const j = await r.json();
    $("yaml").value = j.yaml;
    loadedText = j.yaml;
    loadedHash = j.hash;
    catalog = j.catalog || { servers: {} };
    policyLoaded = true;
    $("pmsg").innerHTML = "";
    if (j.rules) {
      rules = j.rules;
      loadedRulesText = JSON.stringify(cleanRules(rules));
      syncedRules = loadedRulesText;
    } else {
      loadedRulesText = "";
      syncedRules = null;
      mode = "yaml";
      $("pmsg").innerHTML = errBox(esc("This file has errors, so only the YAML editor is available. Fix them there, then switch back to Simple."));
    }
  } catch (e) {
    $("pmsg").innerHTML = errBox(esc(e.message));
  }
  paintMode();
  syncApply();
}

async function pcall(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* non-JSON error body */ }
  if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || "HTTP " + r.status);
  return j;
}

function verdict(d) {
  const a = ACTIONS.filter((x) => x[0] === d)[0];
  return '<span class="pill ' + decClass(d) + '">' + esc(a ? a[1] : d) + "</span>";
}
function changeRow(g) {
  const c = g.c;
  const why = c.ruleIndex == null
    ? (c.reason === "default action" ? "No rule matches, so the default applies" : c.reason)
    : (mode === "simple" ? "Rule " + (c.ruleIndex + 1) : "rule #" + c.ruleIndex) + " decides";
  return '<li><div class="line">' +
    '<span class="mono">' + esc(c.server) + " / " + esc(c.tool) + "</span>" +
    verdict(c.from) + '<span class="arrow">&rarr;</span>' + verdict(c.to) +
    '<span class="rule">' + (g.n > 1 ? esc(g.n) + " calls" : "1 call") + "</span></div>" +
    '<div class="why">' + esc(why) + "</div></li>";
}
function groupChanges(changes) {
  const by = new Map();
  changes.forEach((c) => {
    const k = [c.server, c.tool, c.from, c.to, c.ruleIndex, c.reason].join("|");
    const g = by.get(k);
    if (g) g.n++; else by.set(k, { c: c, n: 1 });
  });
  return Array.from(by.values());
}

function renderResult(s) {
  let html = '<h3>What would have changed</h3><p class="help">Your last recorded calls, replayed against these rules.</p><div class="stats">' +
    tile("Unchanged", s.unchanged, "info") + tile("Now allowed", s.nowAllowed, "ok") +
    tile("Now blocked", s.nowDenied, "bad") + tile("Now asks you", s.nowPrompt, "warn") + "</div>";
  const notes = [];
  if (s.skipped > 0) notes.push("<div>" + esc(s.skipped) + " calls skipped (not enough detail recorded)</div>");
  if (s.approximate > 0) notes.push("<div>" + esc(s.approximate) + " calls estimated (secrets were hidden in the log)</div>");
  if (notes.length) html += '<div class="notes">' + notes.join("") + "</div>";
  html += s.changes.length === 0
    ? callout("ok", "No past calls would change. Safe to apply.")
    : '<ul class="changes">' + groupChanges(s.changes).map(changeRow).join("") + "</ul>";
  $("presult").innerHTML = html;
}

$("yaml").oninput = () => { justApplied = false; syncApply(); };
$("reload").onclick = loadPolicy;

let tabEscapes = false;
$("yaml").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); $("preview").click(); return; }
  if (ev.key === "Escape") { tabEscapes = true; return; }
  if (ev.key === "Tab" && !ev.shiftKey && !tabEscapes) {
    ev.preventDefault();
    const ta = $("yaml");
    ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end");
    ta.dispatchEvent(new Event("input"));
  }
});
$("yaml").addEventListener("blur", () => { tabEscapes = false; });

$("preview").onclick = async () => {
  const text = curText();
  $("pmsg").innerHTML = "";
  try {
    const j = await pcall("/api/policy/preview", payload());
    renderResult(j.result);
    if (window.matchMedia("(max-width: 999px)").matches) $("presult").scrollIntoView({ behavior: "smooth", block: "start" });
    previewedText = text;
  } catch (e) {
    resultsPlaceholder();
    previewedText = null;
    $("pmsg").innerHTML = errBox(esc(e.message));
  }
  syncApply();
};

$("apply").onclick = async () => {
  const text = curText();
  if (text !== previewedText) return;
  try {
    const j = await pcall("/api/policy/apply", Object.assign(payload(), { hash: loadedHash }));
    loadedHash = j.hash;
    loadedText = j.yaml;
    $("yaml").value = j.yaml;
    if (mode === "simple") {
      loadedRulesText = text;
      syncedRules = text;
    } else {
      syncedRules = null;
      try {
        loadedRulesText = JSON.stringify(cleanRules((await pcall("/api/policy/parse", { yaml: j.yaml })).rules));
      } catch (e) { loadedRulesText = ""; }
    }
    previewedText = null;
    justApplied = true;
    say("ok", "Applied — warden is using these rules now.");
    toast("Applied — warden is using these rules now.");
  } catch (e) {
    $("pmsg").innerHTML = errBox(esc(e.message));
  }
  syncApply();
};

// ---- live connection ----
function setConn(on) {
  $("conn").className = "conn" + (on ? " on" : "");
  $("conn-txt").textContent = on ? "Live" : "Reconnecting…";
}
const es = new EventSource("/api/events");
es.onopen = () => setConn(true);
es.onerror = () => setConn(false);
es.addEventListener("warning", (ev) => {
  let msg = "warden warning";
  try { msg = JSON.parse(ev.data).message; } catch (e) { /* keep default */ }
  warn(msg);
});
es.addEventListener("pending", refresh);
es.addEventListener("resolved", refresh);
setInterval(refresh, 5000);
resultsPlaceholder();
syncApply();
refresh();
</script>
</body>
</html>`;
