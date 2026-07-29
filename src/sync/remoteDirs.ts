import * as path from "node:path";
import { createFolder, remotePathExists, remotePathFor } from "../protonDriveCli";
import { FileMeta, saveState } from "./state";

export async function ensureRemoteDir(
  localFolder: string,
  remoteRoot: string,
  relDir: string,
  ensuredDirs: Set<string>,
  knownFiles: Record<string, FileMeta>
): Promise<void> {
  if (relDir === "" || ensuredDirs.has(relDir)) return;

  const parentRel = path.posix.dirname(relDir);
  if (parentRel !== ".") {
    await ensureRemoteDir(localFolder, remoteRoot, parentRel, ensuredDirs, knownFiles);
  }
  const parentRemote = parentRel === "." ? remoteRoot : remotePathFor(remoteRoot, parentRel);

  const name = path.posix.basename(relDir);
  const remotePath = remotePathFor(remoteRoot, relDir);
  if (!(await remotePathExists(remotePath))) {
    console.log(`Creating directory: ${relDir}`);
    await createFolder(parentRemote, name);
  }
  ensuredDirs.add(relDir);
  saveState(localFolder, { files: knownFiles, dirs: Array.from(ensuredDirs) });
}
