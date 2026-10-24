import chokidar from "chokidar";
import type { Config } from "./config/config";
import { errorMessage } from "./protonDrive/commands";
import { runSync } from "./sync/runSync";

const DEBOUNCE_MS = 2000;
const MS_PER_SECOND = 1000;
const WATCHED_EVENTS = ["add", "change", "unlink", "addDir", "unlinkDir"];

async function runSyncLogged(config: Config): Promise<void> {
  try {
    await runSync(config);
  } catch (error) {
    console.error("Sync failed:", errorMessage(error));
  }
}

/** Returns a trigger that never runs two syncs at once; a trigger during a sync queues exactly one rerun. */
function createSyncTrigger(config: Config): () => void {
  let syncing = false;
  let pending = false;

  async function trigger(): Promise<void> {
    if (syncing) {
      pending = true;
      return;
    }

    syncing = true;
    await runSyncLogged(config);
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

export function startWatching(config: Config): void {
  const triggerSync = createSyncTrigger(config);
  const scheduleSync = debounce(triggerSync, DEBOUNCE_MS);
  const watcher = chokidar.watch(config.localFolder, { ignoreInitial: true });

  for (const event of WATCHED_EVENTS) {
    watcher.on(event, scheduleSync);
  }

  // Safety net in case the watcher misses an event.
  setInterval(triggerSync, config.pollIntervalSeconds * MS_PER_SECOND);

  console.log(
    `Watching for changes (full re-check every ${config.pollIntervalSeconds}s). Press Ctrl+C to stop.`
  );
}
