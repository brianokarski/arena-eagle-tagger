import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = path.join(ROOT, ".state");
const STATE_FILE = path.join(STATE_DIR, "sync-state.json");

const EMPTY_STATE = () => ({
  folders: {}, // channel slug -> Eagle folder id ("__root" for the root folder)
  blocks: {}, // Are.na block id -> { channel, name, syncedAt }
  aiTagged: {}, // Eagle item id -> true once the AI pass has tagged it
});

export function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { ...EMPTY_STATE(), ...parsed };
  } catch {
    return EMPTY_STATE();
  }
}

export function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

export const statePath = STATE_FILE;
