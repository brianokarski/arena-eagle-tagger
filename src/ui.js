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
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; max-width: 860px; margin: 0 auto; padding: 1rem 1rem 6rem; }
  h1 { font-size: 1.15rem; }
  .toolbar { position: sticky; top: 0; background: Canvas; padding: .6rem 0; z-index: 2; border-bottom: 1px solid rgba(128,128,128,.25); }
  #search { width: 100%; padding: .55rem .8rem; font-size: 1rem; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); }
  h2 { font-size: .85rem; text-transform: uppercase; letter-spacing: .06em; opacity: .65; margin: 1.4rem 0 .3rem;
       display: flex; align-items: baseline; gap: .8rem; }
  h2 .bulk { font-size: .8rem; text-transform: none; letter-spacing: 0; }
  h2 .bulk a { cursor: pointer; text-decoration: underline; opacity: .8; margin-right: .5rem; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: .4rem .55rem; border-radius: 10px; display: flex; align-items: center; gap: .7rem; }
  li:hover { background: rgba(128,128,128,.12); }
  .thumbs { display: flex; gap: 3px; width: 178px; min-width: 178px; height: 42px; }
  .thumbs img { width: 42px; height: 42px; object-fit: cover; border-radius: 5px; background: rgba(128,128,128,.15); }
  .thumbs .empty { width: 42px; height: 42px; border-radius: 5px; background: rgba(128,128,128,.1); }
  .info { flex: 1; overflow: hidden; }
  label { display: block; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { opacity: .55; font-size: .8em; white-space: nowrap; }
  a.open { text-decoration: none; opacity: .55; font-size: 1.05em; padding: .2rem .4rem; border-radius: 6px; }
  a.open:hover { opacity: 1; background: rgba(128,128,128,.18); }
  .savebar { position: fixed; bottom: 0; left: 0; right: 0; background: Canvas; border-top: 1px solid rgba(128,128,128,.25);
             padding: .7rem 1rem; display: flex; align-items: center; gap: 1rem; justify-content: center; }
  button { padding: .55rem 1.6rem; font-size: 1rem; border-radius: 8px; cursor: pointer; }
  #status { opacity: .75; }
  .muted { opacity: .6; }
</style>
</head>
<body>
<h1>Pick the Are.na channels to sync into Eagle</h1>
<p class="muted">Thumbnails preview each board's latest blocks; ↗ opens the board on are.na. Checked channels are written to <code>config.json</code>; <code>npm run sync</code> imports them into your Eagle "Are.na" folder.</p>
<div class="toolbar"><input id="search" type="search" placeholder="Filter channels…"></div>
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

function render() {
  const host = document.getElementById("sections");
  host.innerHTML = "";
  for (const section of sections) {
    const h2 = document.createElement("h2");
    h2.textContent = section.name + " (" + section.channels.length + ")";
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
    host.append(h2, ul);
  }
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
