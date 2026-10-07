# Instructions for coding agents

You are setting this tool up for someone who was sent this repo by a friend. Read `README.md` first; this file covers what to do with it.

## What this is

`arena-eagle-sync` is a small Node CLI (no build step, ES modules, one optional dependency) that:

1. Copies image blocks from the owner's [Are.na](https://www.are.na) channels into their local [Eagle](https://eagle.cool) library, one Eagle folder per channel (`npm run sync`).
2. Runs a vision model over each imported image and writes category tags onto the Eagle item (`npm run tag`). The allowed tags come from `taxonomy.json`.

## What the owner wants

A personal reference library where every image is categorized by things like **typography, color, layout, poster**. Nothing is published anywhere; it is for their own keeping. The categories that ship in `taxonomy.json` are the original author's, not theirs — replacing them is the main job.

## Setup, in order

1. Check prerequisites: Node 18+ (`node --version`), and the Eagle desktop app installed **and running** — its local API at `http://localhost:41595` only exists while the app is open. Then `npm install` and `npm test`.
2. `cp config.example.json config.json`. This file is gitignored and holds secrets; never commit it or print its contents.
3. Ask the owner to create an Are.na personal access token (are.na → Settings → Applications) and paste it into `config.json` as `arenaToken` themselves, or to hand it to you for that purpose only.
4. Choose channels: have the owner run `npm run ui` (a local picker at `http://localhost:5117`), or write channel slugs into `channels`.
5. Set up tagging in `config.json` → `aiTags`. For an OpenAI key use:
   ```json
   "aiTags": { "enabled": false, "provider": "openai", "model": "gpt-4o-mini", "extraTags": false }
   ```
   and supply the key as the `OPENAI_API_KEY` environment variable (or `openaiApiKey` in `config.json`). Use whichever current OpenAI vision model supports structured outputs; `gpt-4o-mini` is only a default. `"provider": "anthropic"` with `ANTHROPIC_API_KEY` also works.
6. Rewrite `taxonomy.json` with the owner. Ask them what they want to be able to filter by, and keep it small — a short, strict list tags far more consistently than a long one. A starting point for their stated goal:
   ```json
   {
     "typography": ["serif", "sans-serif", "script", "hand-lettered", "monospace"],
     "color": ["monochrome", "black and white", "warm", "cool", "pastel", "neon", "high-contrast"],
     "layout": ["grid", "asymmetric", "centered", "full-bleed", "collage"],
     "poster": [],
     "photography": [],
     "illustration": [],
     "packaging": [],
     "logo": []
   }
   ```
   Keys starting with `_` are comments. A subcategory tag automatically adds its parent category. `extraTags: false` keeps the model strictly inside this list; `true` lets it add up to `maxExtra` free-form tags per image.
7. Run `npm run status` (confirms Eagle is reachable), then `npm run sync`, then a small trial: `node src/cli.js tag --limit=10`. Show the owner the resulting tags in Eagle and adjust `taxonomy.json` before tagging everything with `npm run tag`.

## Things to know before changing code

- **The OpenAI path has unit tests but had not been run against the live API when this repo was published.** The Anthropic path is the one the author uses. If the first `tag --limit=1` fails on OpenAI, the whole provider is `openaiClassifier` / `buildOpenAiRequest` in `src/ai-tagger.js` (Chat Completions, image sent as a base64 data URL, `response_format` JSON schema). Fix it there.
- The tag pass only touches Eagle items whose URL field starts with `https://www.are.na/block/` (`listArenaItems` in `src/sync.js`). If the owner wants to categorize images already in Eagle that did not come from Are.na, that filter is the thing to widen — add a flag rather than removing it, and confirm with the owner first since it will write tags across their whole library.
- Tagging is add-only: tags are merged into an item's existing tags and never removed. Already-tagged item ids live in `.state/sync-state.json` under `aiTagged`; after changing `taxonomy.json`, empty that object to re-tag. Old tags from a previous vocabulary stay on the items unless you remove them.
- The sync is one-way and never deletes from Eagle. `.state/` is gitignored and machine-specific; deleting it forces a full re-check, which is safe (imports are matched by Are.na backlink, so nothing duplicates).
- Eagle's HTTP API ignores `folders` on `item/update`, so an image that is in several channels lives in one folder and gets an `arena:<channel>` tag per channel instead.
- Are.na access uses the v3 API (`src/arena.js`). Each tagged image costs one model call on the thumbnail; say roughly how many images are pending (`npm run status`) before a full run.

## Layout

| File | Role |
| --- | --- |
| `src/cli.js` | Command entry point (`sync`, `tag`, `ui`, `status`) |
| `src/sync.js` | Are.na block → Eagle item mapping, folders, dedupe |
| `src/ai-tagger.js` | Taxonomy loading, prompt/schema, Anthropic + OpenAI classifiers |
| `src/arena.js`, `src/eagle.js` | Thin API clients |
| `src/ui.js` | Local channel-picker web page |
| `src/state.js`, `src/config.js` | `.state/sync-state.json` and `config.json` handling |
| `tests/` | `node --test` unit tests (no network) |
