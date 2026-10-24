import * as path from "node:path";
import { createFolder, remotePathExists } from "../protonDrive/commands";
import { remotePathFor } from "../protonDrive/remotePaths";
import { type FileMeta, saveProgress, type SyncContext } from "./state";

/** Create a remote directory (and its missing parents) unless it is already known or present. */
export async function ensureRemoteDir(
  context: SyncContext,
  relativeDir: string,
  knownFiles: Record<string, FileMeta>
): Promise<void> {
  if (relativeDir === "" || context.ensuredDirs.has(relativeDir)) return;

  const parentRelative = path.posix.dirname(relativeDir);
  if (parentRelative !== ".") {
    await ensureRemoteDir(context, parentRelative, knownFiles);
  }

  if (!(await remotePathExists(remotePathFor(context.remoteRoot, relativeDir)))) {
    console.log(`Creating directory: ${relativeDir}`);
    await createFolder(
      remotePathFor(context.remoteRoot, parentRelative),
      path.posix.basename(relativeDir)
    );
  }

  context.ensuredDirs.add(relativeDir);
  saveProgress(context, knownFiles);
}
