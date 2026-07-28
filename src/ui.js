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
  /* Styled after are.na: Arial/Helvetica (their "areal" fallback stack), small
     bold UI text, 3px radii, black/white/gray palette in both themes. */
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --panel: #ffffff; --text: #000000; --muted: #6e6e6e; --faint: #b9b9b9;
    --line: #e0e0e0; --hover: #f2f2f2; --accent: #000000; --accent-text: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #000000; --panel: #1a1a1a; --text: #e5e5e5; --muted: #999999; --faint: #5e5e5e;
      --line: #2b2b2b; --hover: #1a1a1a; --accent: #e5e5e5; --accent-text: #000000;
    }
  }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.35;
         background: var(--bg); color: var(--text); max-width: 860px; margin: 0 auto; padding: 20px 20px 90px; }
  h1 { font-size: 13px; font-weight: 700; margin: 0 0 4px; }
  .muted { color: var(--muted); font-weight: 400; margin: 0 0 14px; }
  code { font-family: inherit; color: var(--text); }
  .toolbar { position: sticky; top: 0; background: var(--bg); padding: 10px 0 12px; z-index: 2; }
  .tabs { display: flex; gap: 18px; margin-bottom: 12px; }
  .tabs button { padding: 0; font-family: inherit; font-size: 13px; font-weight: 700; color: var(--faint);
                 background: none; border: none; cursor: pointer; }
  .tabs button:hover { color: var(--muted); }
  .tabs button.active { color: var(--text); }
  #search { width: 100%; padding: 8px 10px; font-family: inherit; font-size: 13px; border-radius: 3px;
            border: 1px solid var(--line); background: var(--panel); color: var(--text); }
  #search::placeholder { color: var(--faint); }
  #search:focus { outline: none; border-color: var(--muted); }
  .panel[hidden] { display: none; }
  h2 { font-size: 13px; font-weight: 700; color: var(--muted); margin: 14px 0 6px;
       display: flex; align-items: baseline; gap: 14px; }
  h2 .bulk { font-weight: 700; }
  h2 .bulk a { cursor: pointer; color: var(--faint); text-decoration: none; margin-right: 12px; }
  h2 .bulk a:hover { color: var(--text); }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 6px 8px 6px 0; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--line); }
  li:hover { background: var(--hover); }
  input[type=checkbox] { accent-color: var(--accent); width: 14px; height: 14px; margin: 0 0 0 2px; }
  .thumbs { display: flex; gap: 4px; width: 190px; min-width: 190px; height: 44px; }
  .thumbs img, .thumbs .empty { width: 44px; height: 44px; object-fit: cover; border-radius: 0;
                                border: 1px solid var(--line); background: var(--panel); }
  .info { flex: 1; overflow: hidden; }
  label { display: block; font-weight: 700; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--muted); font-size: 12px; white-space: nowrap; margin-top: 1px; }
  a.open { font-weight: 700; text-decoration: none; color: var(--faint); padding: 4px 6px; border-radius: 3px; }
  a.open:hover { color: var(--text); }
  .savebar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg); border-top: 1px solid var(--line);
             padding: 12px 20px; display: flex; align-items: center; gap: 14px; justify-content: center;
             font-weight: 700; }
  #picked { color: var(--muted); }
  .savebar button { font-family: inherit; font-size: 13px; font-weight: 700; padding: 9px 22px; border-radius: 3px;
                    border: none; background: var(--accent); color: var(--accent-text); cursor: pointer; }
  .savebar button:hover { opacity: .85; }
  #status { color: var(--muted); font-weight: 400; }
</style>
</head>
<body>
<h1>Pick the Are.na channels to sync into Eagle</h1>
<p class="muted">Thumbnails preview each board's latest blocks; ↗ opens the board on are.na. Checked channels are written to <code>config.json</code>; <code>npm run sync</code> imports them into your Eagle "Are.na" folder.</p>
<div class="toolbar">
  <div class="tabs" id="tabs"></div>
  <input id="search" type="search" placeholder="Filter channels…">
</div>
<div id="sections">Loading channels…</div>
<div class="savebar">
  <span id="picked"></span>
  <button id="save">Save selection</button>
  <span id="status"></span>
</div>
<script>
let sections = [];

function updateCount() {
  const n = document.querySelectorAll("input[type=checkbox]:checked").length;
  document.getElementById("picked").textContent = n + " selected";
}

// Lazy thumbnail loading: only fetch previews for rows that scroll into view,
// a few at a time, so 300+ channels don't hammer the Are.na API.
const thumbQueue = [];
let inFlight = 0;
function pumpThumbs() {
  while (inFlight < 4 && thumbQueue.length) {
    const el = thumbQueue.shift();
    inFlight++;
    fetch("/api/thumbs/" + el.dataset.channelId)
      .then((r) => r.json())
      .then(({ thumbs }) => {
        el.innerHTML = "";
        for (const src of thumbs.slice(0, 4)) {
          const img = document.createElement("img");
          img.loading = "lazy";
          img.src = src;
          el.append(img);
        }
        if (!thumbs.length) el.innerHTML = '<div class="empty"></div>';
      })
      .catch(() => {})
      .finally(() => { inFlight--; pumpThumbs(); });
  }
}
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      observer.unobserve(entry.target);
      thumbQueue.push(entry.target);
    }
  }
  pumpThumbs();
}, { rootMargin: "300px" });

let activeTab = 0;
function showTab(i) {
  activeTab = i;
  document.querySelectorAll(".tabs button").forEach((b, j) => b.classList.toggle("active", i === j));
  document.querySelectorAll(".panel").forEach((p, j) => (p.hidden = i !== j));
}

function render() {
  const host = document.getElementById("sections");
  const tabs = document.getElementById("tabs");
  host.innerHTML = "";
  tabs.innerHTML = "";
  sections.forEach((section, i) => {
    const tab = document.createElement("button");
    tab.textContent = section.name + " (" + section.channels.length + ")";
    tab.onclick = () => showTab(i);
    tabs.append(tab);

    const panel = document.createElement("div");
    panel.className = "panel";
    const h2 = document.createElement("h2");
    h2.textContent = section.name;
    const bulk = document.createElement("span");
    bulk.className = "bulk";
    const all = document.createElement("a");
    all.textContent = "select visible";
    const none = document.createElement("a");
    none.textContent = "clear visible";
    bulk.append(all, none);
    h2.append(bulk);

    const ul = document.createElement("ul");
    for (const ch of section.channels) {
      const li = document.createElement("li");
      li.dataset.text = (ch.title + " " + ch.slug + " " + (ch.owner || "")).toLowerCase();

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = ch.slug;
      cb.checked = ch.selected;
      cb.onchange = updateCount;
      const id = section.name + "/" + ch.slug;
      cb.id = id;

      const thumbs = document.createElement("div");
      thumbs.className = "thumbs";
      thumbs.dataset.channelId = ch.id;
      observer.observe(thumbs);

      const info = document.createElement("div");
      info.className = "info";
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = ch.title;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = ch.blocks + " blocks" + (ch.owner ? " · " + ch.owner : "");
      info.append(label, meta);

      const open = document.createElement("a");
      open.className = "open";
      open.href = ch.url;
      open.target = "_blank";
      open.rel = "noopener";
      open.title = "Open on are.na";
      open.textContent = "↗";

      li.append(cb, thumbs, info, open);
      ul.append(li);
    }
    all.onclick = () => { ul.querySelectorAll("li:not([hidden]) input").forEach((cb) => (cb.checked = true)); updateCount(); };
    none.onclick = () => { ul.querySelectorAll("li:not([hidden]) input").forEach((cb) => (cb.checked = false)); updateCount(); };
    panel.append(h2, ul);
    host.append(panel);
  });
  showTab(activeTab);
  updateCount();
}

document.getElementById("search").oninput = (e) => {
  const q = e.target.value.toLowerCase().trim();
  document.querySelectorAll("li").forEach((li) => { li.hidden = q && !li.dataset.text.includes(q); });
};

document.getElementById("save").onclick = async () => {
  const slugs = [...new Set([...document.querySelectorAll("input:checked")].map((cb) => cb.value))];
  const status = document.getElementById("status");
  status.textContent = "saving…";
  const res = await fetch("/api/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channels: slugs }),
  });
  status.textContent = res.ok ? "saved " + slugs.length + " channel(s) ✓" : "save failed";
};

(async () => {
  const res = await fetch("/api/channels");
  const data = await res.json();
  if (data.error) {
    document.getElementById("sections").textContent = "Error: " + data.error;
    return;
  }
  sections = data.sections;
  render();
})();
</script>
</body>
</html>`;

export async function runUi({ log = console.log } = {}) {
  const config = loadConfig();
  const arena = new ArenaClient(config.arenaToken);
  let cache = null;
  const thumbCache = new Map();

  const byRecency = (a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "");

  async function channelSections() {
    if (!cache) {
      const me = await arena.me();
      const [own, following] = await Promise.all([
        arena.userChannels(me.id),
        arena.followingChannels(me.id),
      ]);
      cache = { own, following };
    }
    const { own, following } = cache;
    const selected = new Set(config.channels === "all" ? own.map((c) => c.slug) : config.channels);
    const seen = new Set();
    const shape = (c, ownerLabel) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      blocks: c.counts?.blocks ?? 0,
      owner: ownerLabel,
      url: c.owner?.slug ? `https://www.are.na/${c.owner.slug}/${c.slug}` : `https://www.are.na/search?q=${encodeURIComponent(c.title)}`,
      selected: selected.has(c.slug),
    });

    const mine = [];
    for (const c of [...own].sort(byRecency)) {
      seen.add(c.slug);
      mine.push(shape(c, c.owner?.type === "Group" ? c.owner.name : null));
    }
    const followed = [...following]
      .sort(byRecency)
      .filter((c) => !seen.has(c.slug))
      .map((c) => shape(c, c.owner?.name ?? null));

    return [
      { name: "My channels", channels: mine },
      { name: "Followed channels", channels: followed },
    ];
  }

  async function channelThumbs(channelId) {
    if (thumbCache.has(channelId)) return thumbCache.get(channelId);
    const { data } = await arena.request(`/channels/${encodeURIComponent(channelId)}/contents`, {
      per: 8,
      sort: "created_at_desc",
    }).catch(() => ({ data: [] }));
    const thumbs = (data ?? [])
      .map((b) => b.image?.small?.src ?? b.image?.square?.src ?? b.image?.src ?? null)
      .filter(Boolean)
      .slice(0, 4);
    thumbCache.set(channelId, thumbs);
    return thumbs;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const thumbMatch = req.url.match(/^\/api\/thumbs\/([^/?]+)$/);
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE);
      } else if (req.method === "GET" && req.url === "/api/channels") {
        const sections = await channelSections();
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ sections }));
      } else if (req.method === "GET" && thumbMatch) {
        const thumbs = await channelThumbs(decodeURIComponent(thumbMatch[1]));
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ thumbs }));
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
