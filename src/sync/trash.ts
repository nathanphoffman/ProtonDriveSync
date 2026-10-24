import { errorMessage, trash } from "../protonDrive/commands";
import { remotePathFor } from "../protonDrive/remotePaths";
import { type FileMeta, saveProgress, type SyncContext } from "./state";

async function tryTrash(context: SyncContext, relativePath: string): Promise<boolean> {
  try {
    await trash(remotePathFor(context.remoteRoot, relativePath));

    return true;
  } catch (error) {
    console.error(`Failed to trash ${relativePath}: ${errorMessage(error)}`);

    return false;
  }
}

/** Move remote copies of files that disappeared locally to the Proton Drive trash. */
export async function trashDeletedFiles(
  context: SyncContext,
  previousFiles: Record<string, FileMeta>,
  currentFiles: Record<string, FileMeta>
): Promise<number> {
  let trashed = 0;

  for (const relativePath of Object.keys(previousFiles)) {
    if (relativePath in currentFiles) continue;
    if (!(await tryTrash(context, relativePath))) continue;

    trashed++;
    delete previousFiles[relativePath];
    console.log(`Trashed remote (removed locally): ${relativePath}`);
    saveProgress(context, previousFiles);
  }

  return trashed;
}
