#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { loadState, statePath } from "./state.js";
import { ArenaClient } from "./arena.js";
import { EagleClient } from "./eagle.js";
import { runSync } from "./sync.js";
import { runAiTagging } from "./ai-tagger.js";
import { runUi } from "./ui.js";

const [command = "sync", ...rest] = process.argv.slice(2);
const flags = new Set(rest);

const usage = `arena-eagle-sync

Usage:
  node src/cli.js sync [--full] [--ai-tags]   Import new Are.na blocks into Eagle
  node src/cli.js tag [--limit=N]             AI-tag imported items (needs an Anthropic or OpenAI key)
  node src/cli.js ui                          Open the channel picker (writes config.json)
  node src/cli.js status                      Show what has been synced so far
`;

async function main() {
  if (command === "help" || flags.has("--help")) {
    console.log(usage);
    return;
  }

  const config = loadConfig();
  const state = loadState();
  const arena = new ArenaClient(config.arenaToken);
  const eagle = new EagleClient(config.eagle?.baseUrl);

  switch (command) {
    case "sync": {
      await runSync({ config, arena, eagle, state, full: flags.has("--full") });
      if (flags.has("--ai-tags") || config.aiTags?.enabled) {
        await runAiTagging({ config, eagle, state });
      }
      break;
    }
    case "tag": {
      const limitFlag = rest.find((f) => f.startsWith("--limit="));
      const limit = limitFlag ? Number(limitFlag.split("=")[1]) : Infinity;
      await runAiTagging({ config, eagle, state, limit });
      break;
    }
    case "ui":
      await runUi({});
      break;
    case "status": {
      const blocks = Object.values(state.blocks);
      const byChannel = {};
      for (const b of blocks) byChannel[b.channel] = (byChannel[b.channel] ?? 0) + 1;
      console.log(`Synced blocks: ${blocks.length}`);
      for (const [channel, count] of Object.entries(byChannel)) {
        console.log(`  ${channel}: ${count}`);
      }
      console.log(`AI-tagged items: ${Object.keys(state.aiTagged).length}`);
      console.log(`State file: ${statePath}`);
      try {
        await eagle.ping();
        console.log("Eagle: reachable");
      } catch {
        console.log("Eagle: NOT running (start the app before syncing)");
      }
      break;
    }
    default:
      console.error(`Unknown command "${command}".\n`);
      console.log(usage);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
