import { saveState } from "./state.js";

export function sourceDomain(sourceUrl) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function buildTags(block, channelSlug, tagCfg = {}) {
  const tags = [...(tagCfg.always ?? ["arena"])];
  if (tagCfg.channelTag !== false) tags.push(`arena:${channelSlug}`);
  if (tagCfg.sourceDomainTag !== false && block.source?.url) {
    const domain = sourceDomain(block.source.url);
    if (domain) tags.push(`src:${domain}`);
  }
  return [...new Set(tags)];
}

export function blockWebsite(block) {
  return `https://www.are.na/block/${block.id}`;
}

// Maps an Are.na v3 block to an Eagle addFromURLs item, or null if the block
// has nothing importable (text blocks, embeds/links without a preview image).
export function blockToItem(block, channelSlug, tagCfg = {}) {
  let fileUrl = null;
  switch (block.type) {
    case "Image":
    case "Link":
    case "Embed":
      fileUrl = block.image?.src ?? null;
      break;
    case "Attachment":
      fileUrl = block.attachment?.url ?? block.image?.src ?? null;
      break;
    default:
      return null;
  }
  if (!fileUrl) return null;

  const description = block.description?.plain ?? "";
  const annotationParts = [];
  if (description) annotationParts.push(description);
  if (block.source?.url) annotationParts.push(`Source: ${block.source.url}`);

  return {
    url: fileUrl,
    name: block.title || `arena-${channelSlug}-${block.id}`,
    website: blockWebsite(block),
    annotation: annotationParts.join("\n"),
    tags: buildTags(block, channelSlug, tagCfg),
  };
}

async function ensureFolders(eagle, state, channelSlugs, rootFolderName) {
  const folders = await eagle.listFolders();
  const flat = [];
  const walk = (list) => {
    for (const f of list ?? []) {
      flat.push(f);
      walk(f.children);
    }
  };
  walk(folders);

  let rootId = state.folders.__root;
  if (!rootId || !flat.some((f) => f.id === rootId)) {
    // Reuse an existing folder with this name anywhere in the library before
    // creating a new top-level one.
    const existing = flat.find((f) => f.name === rootFolderName);
    rootId = existing?.id ?? (await eagle.createFolder(rootFolderName)).id;
    state.folders.__root = rootId;
  }

  const rootFolder = flat.find((f) => f.id === rootId);
  const rootChildren = rootFolder?.children ?? [];
  for (const slug of channelSlugs) {
    const known = state.folders[slug];
    if (known && flat.some((f) => f.id === known)) continue;
    const existing = rootChildren.find((f) => f.name === slug);
    state.folders[slug] = existing?.id ?? (await eagle.createFolder(slug, rootId)).id;
  }
}

// Candidate pool is everything the user owns/collaborates on plus channels
// they follow; config.channels narrows it down.
export async function resolveChannels(config, arena) {
  const me = await arena.me();
  const [own, following] = await Promise.all([
    arena.userChannels(me.id),
    arena.followingChannels(me.id),
  ]);
  const bySlug = new Map();
  for (const c of [...own, ...following]) if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);
  const channels = [...bySlug.values()];
  if (config.channels === "all") return channels;
  const wanted = new Set(config.channels);
  return channels.filter((c) => wanted.has(c.slug));
}

// Match freshly imported Eagle items back to their Are.na blocks by the
// website field, so we can cross-link duplicates into extra folders later.
async function recordEagleIds(eagle, state, arenaTag) {
  const items = await eagle.listItems({ tags: arenaTag, limit: 100000 });
  const byWebsite = new Map(items.map((item) => [item.url, item]));
  for (const [blockId, entry] of Object.entries(state.blocks)) {
    if (entry.eagleId) continue;
    const item = byWebsite.get(`https://www.are.na/block/${blockId}`);
    if (item) entry.eagleId = item.id;
  }
  return byWebsite;
}

// A block connected to several synced channels keeps one file in Eagle but is
// linked into every channel's folder (Eagle items can live in many folders).
async function crossLinkDuplicates(eagle, state, duplicates, byWebsite, log) {
  let linked = 0;
  for (const { blockId, slug } of duplicates) {
    const entry = state.blocks[blockId];
    const item = byWebsite.get(`https://www.are.na/block/${blockId}`);
    if (!item) continue;
    const folderId = state.folders[slug];
    const folders = [...new Set([...(item.folders ?? []), folderId])];
    const tags = [...new Set([...(item.tags ?? []), `arena:${slug}`])];
    try {
      await eagle.updateItem({ id: item.id, folders, tags });
      entry.channels.push(slug);
      linked++;
    } catch (err) {
      log(`  could not cross-link "${item.name}" into "${slug}": ${err.message}`);
    }
  }
  return linked;
}

export async function runSync({ config, arena, eagle, state, full = false, log = console.log }) {
  await eagle.ping();

  const channels = await resolveChannels(config, arena);
  if (!channels.length) {
    log("No channels selected. Add channel slugs to config.json (or run `npm run ui` to pick them).");
    return { imported: 0, linked: 0 };
  }

  const slugs = channels.map((c) => c.slug);
  await ensureFolders(eagle, state, slugs, config.eagle?.rootFolderName ?? "Are.na");
  saveState(state);

  const arenaTag = (config.tags?.always ?? ["arena"])[0];
  let imported = 0;
  const duplicates = [];

  for (const channel of channels) {
    const slug = channel.slug;
    log(`Channel "${channel.title ?? slug}": fetching blocks...`);
    const blocks = await arena.channelContents(channel.id ?? slug);

    const fresh = [];
    for (const block of blocks) {
      const entry = state.blocks[block.id];
      if (entry && !full) {
        if (!entry.channels.includes(slug)) duplicates.push({ blockId: String(block.id), slug });
        continue;
      }
      const item = blockToItem(block, slug, config.tags);
      if (item) fresh.push({ block, item });
    }

    if (!fresh.length) {
      log(`  0 new blocks (${blocks.length} total).`);
      continue;
    }

    const folderId = state.folders[slug];
    const CHUNK = 20;
    for (let i = 0; i < fresh.length; i += CHUNK) {
      const chunk = fresh.slice(i, i + CHUNK);
      await eagle.addFromURLs(chunk.map((f) => f.item), folderId);
      const now = new Date().toISOString();
      for (const { block } of chunk) {
        state.blocks[block.id] = { channels: [slug], name: block.title ?? null, syncedAt: now };
      }
      imported += chunk.length;
      saveState(state);
      log(`  imported ${Math.min(i + CHUNK, fresh.length)}/${fresh.length}`);
    }
  }

  // Give Eagle a moment to finish downloading before matching items back.
  let linked = 0;
  if (imported || duplicates.length) {
    if (imported) await new Promise((r) => setTimeout(r, 3000));
    const byWebsite = await recordEagleIds(eagle, state, arenaTag);
    linked = await crossLinkDuplicates(eagle, state, duplicates, byWebsite, log);
    saveState(state);
  }

  log(
    `Done. Imported ${imported} new item(s).` +
      (linked ? ` Cross-linked ${linked} duplicate(s) into additional folders (single file, multiple folders).` : "")
  );
  return { imported, linked };
}
