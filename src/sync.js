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

// Maps an Are.na block to an Eagle addFromURLs item, or null if the block has
// nothing importable (text blocks, media embeds without a preview image).
export function blockToItem(block, channelSlug, tagCfg = {}) {
  let fileUrl = null;
  switch (block.class) {
    case "Image":
    case "Link":
    case "Media":
      fileUrl = block.image?.original?.url ?? block.image?.display?.url ?? null;
      break;
    case "Attachment":
      fileUrl = block.attachment?.url ?? null;
      break;
    default:
      return null;
  }
  if (!fileUrl) return null;

  const annotationParts = [];
  if (block.description) annotationParts.push(block.description);
  if (block.source?.url) annotationParts.push(`Source: ${block.source.url}`);

  return {
    url: fileUrl,
    name: block.title || `arena-${channelSlug}-${block.id}`,
    website: `https://www.are.na/block/${block.id}`,
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
    const existing = flat.find((f) => f.name === rootFolderName && !f.parent);
    rootId = existing?.id ?? (await eagle.createFolder(rootFolderName)).id;
    state.folders.__root = rootId;
  }

  for (const slug of channelSlugs) {
    const known = state.folders[slug];
    if (known && flat.some((f) => f.id === known)) continue;
    const existing = flat.find((f) => f.name === slug && f.parent === rootId);
    state.folders[slug] = existing?.id ?? (await eagle.createFolder(slug, rootId)).id;
  }
}

export async function resolveChannelSlugs(config, arena) {
  if (config.channels !== "all") return config.channels;
  const me = await arena.me();
  const channels = await arena.userChannels(me.id);
  return channels.map((c) => c.slug);
}

export async function runSync({ config, arena, eagle, state, full = false, log = console.log }) {
  await eagle.ping();

  const slugs = await resolveChannelSlugs(config, arena);
  if (!slugs.length) {
    log("No channels selected. Add channel slugs to config.json (or run `npm run ui` to pick them).");
    return { imported: 0, skipped: 0 };
  }

  await ensureFolders(eagle, state, slugs, config.eagle?.rootFolderName ?? "Are.na");
  saveState(state);

  let imported = 0;
  let skipped = 0;
  for (const slug of slugs) {
    log(`Channel "${slug}": fetching blocks...`);
    const blocks = await arena.channelContents(slug);

    const fresh = [];
    for (const block of blocks) {
      const known = state.blocks[block.id];
      if (known && !full) {
        if (known.channel !== slug) skipped++;
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
        state.blocks[block.id] = { channel: slug, name: block.title ?? null, syncedAt: now };
      }
      imported += chunk.length;
      saveState(state);
      log(`  imported ${Math.min(i + CHUNK, fresh.length)}/${fresh.length}`);
    }
  }

  log(`Done. Imported ${imported} new item(s).` + (skipped ? ` Skipped ${skipped} duplicate(s) already synced via another channel.` : ""));
  return { imported, skipped };
}
