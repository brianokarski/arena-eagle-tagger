import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveState } from "./state.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAXONOMY_FILE = path.join(ROOT, "taxonomy.json");

// File extensions lie (webp saved as .png is common) — sniff the magic bytes.
function sniffMediaType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function loadTaxonomy() {
  const raw = JSON.parse(fsSync.readFileSync(TAXONOMY_FILE, "utf8"));
  const taxonomy = {};
  for (const [category, subs] of Object.entries(raw)) {
    if (category.startsWith("_")) continue;
    taxonomy[category] = subs;
  }
  return taxonomy;
}

export function vocabularyOf(taxonomy) {
  return [...new Set(Object.entries(taxonomy).flatMap(([cat, subs]) => [cat, ...subs]))];
}

// Children imply their parent category (e.g. "portrait" -> "photography").
export function expandParents(tags, taxonomy) {
  const out = new Set(tags);
  for (const [category, subs] of Object.entries(taxonomy)) {
    if (subs.some((s) => out.has(s))) out.add(category);
  }
  return [...out];
}

function buildSchema(vocabulary, allowExtra) {
  const properties = {
    tags: { type: "array", items: { type: "string", enum: vocabulary } },
  };
  if (allowExtra) {
    properties.extra = { type: "array", items: { type: "string" } };
  }
  return {
    type: "json_schema",
    schema: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

function buildPrompt(taxonomy, allowExtra, maxExtra) {
  const lines = Object.entries(taxonomy)
    .map(([cat, subs]) => (subs.length ? `- ${cat}: ${subs.join(", ")}` : `- ${cat}`))
    .join("\n");
  return (
    `You are tagging a design reference library. Classify this image using ONLY tags from this vocabulary (categories and their subcategories):\n${lines}\n\n` +
    `Rules: pick every tag that clearly applies; include the subcategory when one fits (e.g. a studio photo gets "photography" and "studio"). ` +
    `Omit anything you are not confident about — no tags is better than wrong tags.` +
    (allowExtra
      ? ` Additionally, you may suggest up to ${maxExtra} short lowercase "extra" tags outside the vocabulary for notable qualities the vocabulary misses (e.g. a medium, era, or technique).`
      : "")
  );
}

export async function runAiTagging({ config, eagle, state, limit = Infinity, log = console.log }) {
  const aiCfg = config.aiTags ?? {};
  const model = aiCfg.model ?? "claude-opus-5";
  const allowExtra = aiCfg.extraTags !== false;
  const maxExtra = aiCfg.maxExtra ?? 3;

  const taxonomy = loadTaxonomy();
  const vocabulary = vocabularyOf(taxonomy);
  const schema = buildSchema(vocabulary, allowExtra);
  const prompt = buildPrompt(taxonomy, allowExtra, maxExtra);

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // Key from config.json (gitignored) or the ANTHROPIC_API_KEY environment variable.
  const client = new Anthropic(config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {});

  const { listArenaItems } = await import("./sync.js");
  const items = await listArenaItems(eagle);
  const pending = items.filter((item) => !state.aiTagged[item.id]).slice(0, limit);
  if (!pending.length) {
    log("All synced items are already AI-tagged.");
    return { tagged: 0 };
  }
  log(`AI-tagging ${pending.length} item(s) with ${model} against ${vocabulary.length} vocabulary tags...`);

  let tagged = 0;
  const CONCURRENCY = 3;
  const queue = [...pending];

  const worker = async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      try {
        const thumbPath = await eagle.thumbnailPath(item.id);
        const buf = await fs.readFile(thumbPath);
        const mediaType = sniffMediaType(buf);
        if (!mediaType) {
          state.aiTagged[item.id] = true; // not a recognizable image; skip permanently
          continue;
        }
        const data = buf.toString("base64");

        const response = await client.messages.create({
          model,
          max_tokens: 4096,
          output_config: { effort: "low", format: schema },
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data } },
                { type: "text", text: prompt },
              ],
            },
          ],
        });
        if (response.stop_reason === "refusal") {
          log(`  skipped "${item.name}" (model declined to analyze the image)`);
          state.aiTagged[item.id] = true;
          continue;
        }
        const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
        const parsed = JSON.parse(text);
        const vocabTags = expandParents(parsed.tags ?? [], taxonomy);
        const extraTags = (parsed.extra ?? [])
          .slice(0, maxExtra)
          .map((t) => t.toLowerCase().trim().replace(/\s+/g, " "))
          .filter((t) => t && !vocabulary.includes(t));

        const merged = [...new Set([...(item.tags ?? []), ...vocabTags, ...extraTags])];
        if (merged.length > (item.tags ?? []).length) {
          await eagle.updateItem({ id: item.id, tags: merged });
        }
        state.aiTagged[item.id] = true;
        tagged++;
        log(`  [${tagged}/${pending.length}] "${item.name.slice(0, 40)}" -> ${[...vocabTags, ...extraTags].join(", ") || "(no tags)"}`);
        if (tagged % 10 === 0) saveState(state);
      } catch (err) {
        log(`  failed on "${item.name}": ${err.message} (will retry next run)`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveState(state);
  log(`Done. AI-tagged ${tagged} item(s).`);
  return { tagged };
}
