import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const configPath = path.join(ROOT, "config.json");

export function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      "config.json not found. Copy config.example.json to config.json, paste your Are.na personal access token, then pick channels (edit the list or run `npm run ui`)."
    );
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!config.arenaToken || config.arenaToken.startsWith("PASTE-")) {
    throw new Error(
      'No Are.na token set. Create one at https://dev.are.na/oauth/applications (personal access token) and put it in config.json as "arenaToken".'
    );
  }
  if (config.channels !== "all" && !Array.isArray(config.channels)) {
    throw new Error('config.json "channels" must be "all" or an array of channel slugs.');
  }
  return config;
}

export function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
