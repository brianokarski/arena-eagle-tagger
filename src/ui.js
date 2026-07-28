import http from "node:http";
import { loadConfig, saveConfig } from "./config.js";
import { ArenaClient } from "./arena.js";

const PORT = 5117;

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Are.na → Eagle: channel picker</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem; }
  h1 { font-size: 1.2rem; }
  ul { list-style: none; padding: 0; }
  li { padding: .45rem .6rem; border-radius: 8px; display: flex; align-items: center; gap: .6rem; }
  li:hover { background: rgba(128,128,128,.12); }
  label { flex: 1; cursor: pointer; }
  .count { opacity: .55; font-size: .85em; }
  button { margin-top: 1rem; padding: .55rem 1.4rem; font-size: 1rem; border-radius: 8px; cursor: pointer; }
  #status { margin-left: .8rem; opacity: .7; }
  .muted { opacity: .6; }
</style>
</head>
<body>
<h1>Pick the Are.na channels to sync into Eagle</h1>
<p class="muted">Checked channels are written to <code>config.json</code>. Run <code>npm run sync</code> afterwards.</p>
<ul id="list">Loading channels…</ul>
<button id="save">Save selection</button><span id="status"></span>
<script>
async function load() {
  const res = await fetch("/api/channels");
  const { channels, selected } = await res.json();
  const list = document.getElementById("list");
  list.innerHTML = "";
  for (const ch of channels) {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = ch.slug;
    cb.value = ch.slug;
    cb.checked = selected.includes(ch.slug);
    const label = document.createElement("label");
    label.htmlFor = ch.slug;
    label.textContent = ch.title;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = ch.length + " blocks";
    li.append(cb, label, count);
    list.append(li);
  }
}
document.getElementById("save").onclick = async () => {
  const slugs = [...document.querySelectorAll("input:checked")].map((cb) => cb.value);
  const status = document.getElementById("status");
  status.textContent = "saving…";
  await fetch("/api/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channels: slugs }),
  });
  status.textContent = "saved " + slugs.length + " channel(s) to config.json";
};
load();
</script>
</body>
</html>`;

export async function runUi({ log = console.log } = {}) {
  const config = loadConfig();
  const arena = new ArenaClient(config.arenaToken);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE);
      } else if (req.method === "GET" && req.url === "/api/channels") {
        const me = await arena.me();
        const channels = await arena.userChannels(me.id);
        const selected = config.channels === "all" ? channels.map((c) => c.slug) : config.channels;
        res.writeHead(200, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            channels: channels.map((c) => ({ slug: c.slug, title: c.title, length: c.length })),
            selected,
          })
        );
      } else if (req.method === "POST" && req.url === "/api/channels") {
        let body = "";
        for await (const chunk of req) body += chunk;
        config.channels = JSON.parse(body).channels;
        saveConfig(config);
        log(`Saved ${config.channels.length} channel(s) to config.json`);
        res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
      } else {
        res.writeHead(404).end("not found");
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    log(`Channel picker running at http://localhost:${PORT} — Ctrl+C to stop.`);
  });
  return server;
}
