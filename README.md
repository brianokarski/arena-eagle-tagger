# Arena <> Eagle tagg 'n sync

One-way sync from [Are.na](https://www.are.na) channels into an [Eagle](https://eagle.cool) library. Every image/attachment block lands in an Eagle folder per channel, tagged (`arena`, `arena:<channel>`, `src:<domain>`) with a backlink to the Are.na block — ready for Eagle filters and smart folders. An optional AI pass then categorizes every image against a vocabulary you define (typography, color, layout, poster, …) using the Claude or OpenAI API.

## Setup

1. **Node 18+** and the **Eagle app** installed. Eagle must be running when you sync (the tool talks to its local API on `localhost:41595`).
2. Install the one dependency (only used by Anthropic AI tagging, but install anyway):

   ```bash
   npm install
   ```

3. Get an Are.na **personal access token**: are.na → Settings → Applications → personal access token (or https://dev.are.na/oauth/applications).
4. Create your config:

   ```bash
   cp config.example.json config.json
   ```

   Paste the token into `config.json` as `arenaToken`.

5. Pick which channels sync — either edit the `channels` array by hand (channel slugs, i.e. the part after `are.na/you/` in the URL), set it to `"all"`, or use the picker:

   ```bash
   npm run ui
   ```

   Opens `http://localhost:5117` with all your channels as checkboxes; saving writes the selection to `config.json`.

## Usage

```bash
npm run sync        # import new blocks (incremental — safe to re-run)
npm run status      # what's synced, and whether Eagle is reachable
npm run tag         # AI tagging pass (needs an Anthropic or OpenAI key)
node src/cli.js sync --full      # re-check every block, not just new ones
node src/cli.js sync --ai-tags   # sync, then AI-tag in one go
```

### What gets imported

| Are.na block | Behavior |
| --- | --- |
| Image | Imported at original resolution |
| Link | Imported as Are.na's preview screenshot (skipped if none) |
| Attachment | Imported directly (PDFs etc.) |
| Media (embeds) | Preview image if available, else skipped |
| Text | Skipped |

Nothing is ever deleted from Eagle; blocks removed on Are.na stay in your library. A block connected to multiple synced channels imports once (first channel wins) — later sightings are logged as skipped.

### AI tagging

The tag pass looks at each imported item's Eagle thumbnail and classifies it against **your own vocabulary** in `taxonomy.json`. Keys are categories, values are optional subcategories; a subcategory implies its category (`portrait` also adds `photography`). Edit it freely — it's re-read on every run:

```json
{
  "typography": ["serif", "sans-serif", "hand-lettered"],
  "color": ["monochrome", "warm", "cool", "high-contrast"],
  "layout": ["grid", "asymmetric"],
  "poster": []
}
```

The model can only answer with tags from that list (schema-enforced), plus up to `maxExtra` free-form "extra" tags unless you set `"extraTags": false`. Tags are merged into the item's existing Eagle tags, never removed.

Pick a provider in `config.json` under `aiTags`:

| `provider` | Key | Default model |
| --- | --- | --- |
| `"anthropic"` (default) | `ANTHROPIC_API_KEY` env var, or `anthropicApiKey` in `config.json` | `claude-opus-5` — set `"model": "claude-haiku-4-5"` for a much cheaper pass |
| `"openai"` | `OPENAI_API_KEY` env var, or `openaiApiKey` in `config.json` | `gpt-4o-mini` — set `"model"` to any vision model that supports structured outputs |

Then run `npm run tag`, or set `"enabled": true` so it runs after every sync. Try `node src/cli.js tag --limit=10` first to check the tags look right before spending on the whole library. The pass is resumable — already-tagged items are remembered in `.state/sync-state.json`, so after changing `taxonomy.json` clear the `aiTagged` object there to re-tag everything.

Only items imported from Are.na by this tool are tagged (they're recognized by their `are.na/block/…` backlink); the rest of your Eagle library is left alone.

Alternatively, skip this entirely and use Eagle's own built-in AI tagging on the imported items.

## Scheduling (optional)

Run `node /full/path/to/src/cli.js sync` on whatever scheduler your OS has (cron or launchd on macOS, Task Scheduler on Windows). Eagle must be open for imports to land.

## Files

- `config.json` — your token, keys + channel selection (gitignored)
- `taxonomy.json` — the tag vocabulary for the AI pass
- `AGENTS.md` — setup instructions for a coding agent (ChatGPT/Codex, Claude Code, …)
- `.state/sync-state.json` — which blocks are already imported, folder ids, AI-tag progress (gitignored; delete it to force a full re-import)
