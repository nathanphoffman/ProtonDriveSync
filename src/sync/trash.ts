import { errorMessage, trash } from "../protonDrive/commands";
import { remotePathFor } from "../protonDrive/remotePaths";
import { type FileMeta, saveProgress, type SyncContext } from "./state";

/** Move remote copies of files that disappeared locally to the Proton Drive trash. */
export async function trashDeletedFiles(
  context: SyncContext,
  previousFiles: Record<string, FileMeta>,
  currentFiles: Record<string, FileMeta>
): Promise<number> {
  let trashed = 0;

  for (const relativePath of Object.keys(previousFiles)) {
    if (relativePath in currentFiles) continue;

    try {
      await trash(remotePathFor(context.remoteRoot, relativePath));
    } catch (error) {
      console.error(`Failed to trash ${relativePath}: ${errorMessage(error)}`);
      continue;
    }

    trashed++;
    delete previousFiles[relativePath];
    console.log(`Trashed remote (removed locally): ${relativePath}`);
    saveProgress(context, previousFiles);
  }

  return trashed;
}
