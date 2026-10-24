import chokidar from "chokidar";
import { errorMessage } from "./protonDrive/commands";

const DEBOUNCE_MS = 2000;
const MS_PER_SECOND = 1000;
const WATCHED_EVENTS = ["add", "change", "unlink", "addDir", "unlinkDir"];

type SyncTask = () => Promise<void>;

async function runTaskLogged(task: SyncTask): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error("Sync failed:", errorMessage(error));
  }
}

/** Returns a trigger that never runs two syncs at once; a trigger during a sync queues exactly one rerun. */
function createSyncTrigger(task: SyncTask): () => void {
  let syncing = false;
  let pending = false;

  async function trigger(): Promise<void> {
    if (syncing) {
      pending = true;
      return;
    }

    syncing = true;
    await runTaskLogged(task);
    syncing = false;

    if (pending) {
      pending = false;
      void trigger();
    }
  }

  return () => void trigger();
}

/** Wait for a burst of file events to go quiet before syncing once. */
function debounce(action: () => void, delayMs: number): () => void {
  let timer: NodeJS.Timeout | undefined;

  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(action, delayMs);
  };
}

/** Run `syncTask` whenever files change, plus every `pollIntervalSeconds` as a safety net. */
export function startWatching(localFolder: string, pollIntervalSeconds: number, syncTask: SyncTask): void {
  const triggerSync = createSyncTrigger(syncTask);
  const scheduleSync = debounce(triggerSync, DEBOUNCE_MS);
  const watcher = chokidar.watch(localFolder, { ignoreInitial: true });

  for (const event of WATCHED_EVENTS) {
    watcher.on(event, scheduleSync);
  }

  setInterval(triggerSync, pollIntervalSeconds * MS_PER_SECOND);

  console.log(`Watching for changes (full re-check every ${pollIntervalSeconds}s). Press Ctrl+C to stop.`);
}
