import fs from "node:fs/promises";
import path from "node:path";
import { saveState } from "./state.js";

const MEDIA_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const TAG_SCHEMA = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["tags"],
    additionalProperties: false,
  },
};

function tagPrompt(maxTags) {
  return (
    `Look at this image and produce up to ${maxTags} lowercase tags for a design reference library. ` +
    `Cover: subject matter, medium/format (e.g. editorial-layout, poster, ui-screenshot, photograph, 3d-render), ` +
    `visual style (e.g. brutalism, minimal, retro), and dominant palette (e.g. warm-tones, monochrome). ` +
    `Use hyphens instead of spaces. Only include tags you are confident about.`
  );
}

export async function runAiTagging({ config, eagle, state, log = console.log }) {
  const aiCfg = config.aiTags ?? {};
  const model = aiCfg.model ?? "claude-opus-5";
  const maxTags = aiCfg.maxTags ?? 8;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  const { listArenaItems } = await import("./sync.js");
  const items = await listArenaItems(eagle);
  const pending = items.filter((item) => !state.aiTagged[item.id]);
  if (!pending.length) {
    log("All synced items are already AI-tagged.");
    return { tagged: 0 };
  }
  log(`AI-tagging ${pending.length} item(s) with ${model}...`);

  let tagged = 0;
  const CONCURRENCY = 3;
  const queue = [...pending];

  const worker = async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      try {
        const thumbPath = await eagle.thumbnailPath(item.id);
        const mediaType = MEDIA_TYPES[path.extname(thumbPath).toLowerCase()];
        if (!mediaType) {
          state.aiTagged[item.id] = true; // not an image thumbnail; skip permanently
          continue;
        }
        const data = (await fs.readFile(thumbPath)).toString("base64");

        const response = await client.messages.create({
          model,
          max_tokens: 4096,
          output_config: { effort: "low", format: TAG_SCHEMA },
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data } },
                { type: "text", text: tagPrompt(maxTags) },
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
        const newTags = (JSON.parse(text).tags ?? [])
          .slice(0, maxTags)
          .map((t) => t.toLowerCase().trim().replace(/\s+/g, "-"));

        const merged = [...new Set([...(item.tags ?? []), ...newTags])];
        await eagle.updateItem({ id: item.id, tags: merged });
        state.aiTagged[item.id] = true;
        tagged++;
        if (tagged % 5 === 0) {
          saveState(state);
          log(`  tagged ${tagged}/${pending.length}`);
        }
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
