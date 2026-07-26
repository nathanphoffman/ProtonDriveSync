import chokidar from "chokidar";
import * as path from "node:path";
import { loadConfig } from "./config";
import { runSync } from "./sync";

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const config = loadConfig();
  const folderName = path.basename(config.localFolder);

  console.log(`Syncing "${config.localFolder}" -> Proton Drive /my-files/${folderName}`);
  await runSync(config);

  if (once || !config.watch) {
    return;
  }

  let syncing = false;
  let pending = false;

  async function triggerSync(): Promise<void> {
    if (syncing) {
      pending = true;
      return;
    }
    syncing = true;
    try {
      await runSync(config);
    } catch (err) {
      console.error("Sync failed:", err instanceof Error ? err.message : err);
    } finally {
      syncing = false;
      if (pending) {
        pending = false;
        void triggerSync();
      }
    }
  }

  let debounceTimer: NodeJS.Timeout | undefined;
  function scheduleSync(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void triggerSync(), 2000);
  }

  const watcher = chokidar.watch(config.localFolder, { ignoreInitial: true });
  watcher.on("add", scheduleSync);
  watcher.on("change", scheduleSync);
  watcher.on("unlink", scheduleSync);
  watcher.on("addDir", scheduleSync);
  watcher.on("unlinkDir", scheduleSync);

  setInterval(() => void triggerSync(), config.pollIntervalSeconds * 1000);

  console.log(
    `Watching for changes (full re-check every ${config.pollIntervalSeconds}s). Press Ctrl+C to stop.`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
