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

const sleepSync = (ms) => {
  const buf = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buf), 0, 0, ms);
};

export function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  // Dropbox/antivirus briefly lock files on Windows, making the atomic rename
  // fail with EPERM — retry, then fall back to a direct (non-atomic) write.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, STATE_FILE);
      return;
    } catch (err) {
      if (attempt < 5 && (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES")) {
        sleepSync(200 * (attempt + 1));
        continue;
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      try {
        fs.unlinkSync(tmp);
      } catch {}
      return;
    }
  }
}

export const statePath = STATE_FILE;
