# arena-eagle-sync

One-way sync from [Are.na](https://www.are.na) channels into an [Eagle](https://eagle.cool) library. Every image/attachment block lands in an Eagle folder per channel, tagged (`arena`, `arena:<channel>`, `src:<domain>`) with a backlink to the Are.na block — ready for Eagle filters and smart folders. An optional AI pass adds visual tags (subject, style, palette) via the Claude API.

## Setup

1. **Node 18+** and the **Eagle app** installed. Eagle must be running when you sync (the tool talks to its local API on `localhost:41595`).
2. Install the one dependency (only needed for AI tagging, but install anyway):

   ```bash
   npm install
   ```

3. Get an Are.na **personal access token**: are.na → Settings → Applications → personal access token (or https://dev.are.na/oauth/applications).
4. Create your config:

   ```bash
   copy config.example.json config.json
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
npm run tag         # AI visual tagging pass (needs ANTHROPIC_API_KEY set)
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

Set `ANTHROPIC_API_KEY` in your environment and either run `npm run tag`, or set `"aiTags": { "enabled": true }` in `config.json` so it runs after every sync. Each item's Eagle thumbnail is sent to Claude, which returns up to `maxTags` lowercase tags (e.g. `editorial-layout`, `brutalism`, `warm-tones`) merged into the item's existing tags. The pass is resumable — already-tagged items are remembered in `.state/sync-state.json`.

The default model is `claude-opus-5`; set `"model": "claude-haiku-4-5"` in `aiTags` for a much cheaper pass (tagging thumbnails is easy work).

Alternatively, skip this entirely and use Eagle's own built-in AI tagging on the imported items.

## Scheduling (optional)

To sync daily at 9am via Windows Task Scheduler (Eagle must be open for imports to land):

```bash
schtasks /Create /SC DAILY /ST 09:00 /TN "arena-eagle-sync" /TR "node \"C:\Users\brian\Dropbox\02-Development\Agentic Coding\Random\eagle-arena-connection\src\cli.js\" sync"
```

## Files

- `config.json` — your token + channel selection (gitignored)
- `.state/sync-state.json` — which blocks are already imported, folder ids, AI-tag progress (gitignored; delete it to force a full re-import)
