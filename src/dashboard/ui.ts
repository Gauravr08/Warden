export const DASHBOARD_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>warden</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f1117; color: #e6e6e6; }
  header { padding: 12px 20px; background: #161a23; font-weight: 600; }
  header span { color: #7aa2f7; }
  main { padding: 20px; max-width: 1000px; margin: 0 auto; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #9aa0b0; }
  .card { background: #161a23; border: 1px solid #2a2f3d; border-radius: 8px; padding: 14px; margin: 10px 0; }
  .card .meta { font-family: ui-monospace, monospace; font-size: 13px; margin-bottom: 8px; }
  .flags { color: #f7768e; font-size: 12px; margin-bottom: 8px; }
  button { border: 0; border-radius: 6px; padding: 6px 12px; margin-right: 6px; cursor: pointer; font-size: 13px; }
  .ok { background: #9ece6a; } .no { background: #f7768e; }
  .always { background: #2a2f3d; color: #e6e6e6; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #2a2f3d; text-align: left; }
  .allow { color: #9ece6a; } .deny { color: #f7768e; } .approve { color: #e0af68; }
  select { background: #161a23; color: #e6e6e6; border: 1px solid #2a2f3d; border-radius: 6px; padding: 4px; }
  #empty { color: #565f89; }
</style>
</head>
<body>
<header>warden <span>gateway</span></header>
<main>
  <h2>Pending approvals</h2>
  <div id="pending"><p id="empty">Nothing pending.</p></div>
  <h2>Audit log <select id="decision">
    <option value="">all</option><option>allow</option><option>deny</option>
  </select></h2>
  <table><thead><tr>
    <th>time</th><th>server</th><th>tool</th><th>decision</th><th>flags</th><th>ms</th>
  </tr></thead><tbody id="audit"></tbody></table>
</main>
<script>
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function act(id, action) {
  await fetch("/api/pending/" + id, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  refresh();
}

function card(p) {
  const div = document.createElement("div");
  div.className = "card";
  const flags = p.flags.length ? '<div class="flags">flags: ' + esc(p.flags.join(", ")) + "</div>" : "";
  div.innerHTML =
    '<div class="meta">' + esc(p.server) + " / " + esc(p.tool) + (p.phase === "result" ? " (flagged result)" : "") + "</div>" +
    flags +
    '<div class="meta">' + esc(JSON.stringify(p.args)) + "</div>";
  const mk = (label, cls, action) => {
    const b = document.createElement("button");
    b.textContent = label; b.className = cls;
    b.onclick = () => act(p.id, action);
    div.appendChild(b);
  };
  mk("Approve once", "ok", "approve");
  mk("Deny", "no", "deny");
  mk("Always allow", "always", "always_allow");
  mk("Always deny", "always", "always_deny");
  return div;
}

async function refresh() {
  const pending = await (await fetch("/api/pending")).json();
  const box = $("pending");
  box.innerHTML = pending.length ? "" : '<p id="empty">Nothing pending.</p>';
  pending.forEach((p) => box.appendChild(card(p)));

  const q = $("decision").value ? "?decision=" + $("decision").value : "";
  const rows = await (await fetch("/api/audit" + q)).json();
  $("audit").innerHTML = rows.map((r) =>
    "<tr><td>" + new Date(r.ts).toLocaleTimeString() + "</td><td>" + esc(r.server) +
    "</td><td>" + esc(r.tool) + '</td><td class="' + esc(r.decision) + '">' + esc(r.decision) +
    "</td><td>" + esc(r.flags.join(", ")) + "</td><td>" + esc(r.durationMs ?? "") + "</td></tr>"
  ).join("");
}

$("decision").onchange = refresh;
const es = new EventSource("/api/events");
es.addEventListener("pending", refresh);
es.addEventListener("resolved", refresh);
setInterval(refresh, 5000);
refresh();
</script>
</body>
</html>`;
