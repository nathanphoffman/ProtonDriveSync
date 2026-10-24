import * as path from "node:path";
import type { Config } from "../config/config";
import { createFolder, remotePathExists } from "../protonDrive/commands";
import { remoteChild } from "../protonDrive/remotePaths";
import { listLocal } from "./localScan";
import { ensureRemoteDir } from "./remoteDirs";
import { type FileMeta, loadState, saveProgress, type SyncContext } from "./state";
import { trashDeletedFiles } from "./trash";
import { planUploads, uploadChangedFiles } from "./uploads";

export const REMOTE_ROOT_PARENT = "/my-files";

async function ensureRemoteRoot(
  context: SyncContext,
  folderName: string,
  knownFiles: Record<string, FileMeta>
): Promise<void> {
  if (context.ensuredDirs.has("")) return;

  if (!(await remotePathExists(context.remoteRoot))) {
    await createFolder(REMOTE_ROOT_PARENT, folderName);
  }

  context.ensuredDirs.add("");
  saveProgress(context, knownFiles);
}

function logSummary(config: Config, checked: number, uploaded: number, trashed: number): void {
  const trashedNote = config.mirrorDeletes ? `, ${trashed} trashed` : "";

  console.log(`Sync complete: ${checked} local files checked, ${uploaded} uploaded${trashedNote}.`);
}

/** One full pass: make sure remote dirs exist, upload what changed, optionally trash what was deleted. */
export async function runSync(config: Config): Promise<void> {
  const folderName = path.basename(config.localFolder);
  const state = loadState(config.localFolder);
  const context: SyncContext = {
    config,
    remoteRoot: remoteChild(REMOTE_ROOT_PARENT, folderName),
    ensuredDirs: new Set(state.dirs),
  };
  const currentFiles: Record<string, FileMeta> = {};

  await ensureRemoteRoot(context, folderName, state.files);

  const { files, dirs } = listLocal(config.localFolder);
  for (const relativeDir of dirs) {
    await ensureRemoteDir(context, relativeDir, state.files);
  }

  const toUpload = planUploads(config.localFolder, files, state.files, currentFiles);
  const uploaded = await uploadChangedFiles(context, toUpload, currentFiles);
  const trashed = config.mirrorDeletes
    ? await trashDeletedFiles(context, state.files, currentFiles)
    : 0;

  saveProgress(context, currentFiles);
  logSummary(config, files.length, uploaded, trashed);
}
