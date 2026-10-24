import * as path from "node:path";
import { loadConfig } from "./config/config";
import { errorMessage } from "./protonDrive/commands";
import { runSync, REMOTE_ROOT_PARENT } from "./sync/runSync";
import { startWatching } from "./watch";

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const config = loadConfig();
  const folderName = path.basename(config.localFolder);

  console.log(`Syncing "${config.localFolder}" -> Proton Drive ${REMOTE_ROOT_PARENT}/${folderName}`);
  await runSync(config);

  if (!once && config.watch) {
    startWatching(config);
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
