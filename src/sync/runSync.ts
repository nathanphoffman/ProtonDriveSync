import * as path from "node:path";
import type { Config } from "../config/config";
import { createFolder, remotePathExists } from "../protonDrive/commands";
import { remoteChild } from "../protonDrive/remotePaths";
import { listLocal } from "./localScan";
import { ensureRemoteDir } from "./remoteDirs";
import { type FileMeta, loadState, saveProgress, type State, statePath, type SyncContext } from "./state";
import { trashDeletedFiles } from "./trash";
import { planUploads, uploadChangedFiles } from "./uploads";

export const REMOTE_ROOT_PARENT = "/my-files";

function createContext(config: Config, state: State, stateFilePath: string): SyncContext {
  const folderName = path.basename(config.localFolder);

  return {
    config,
    remoteRoot: remoteChild(REMOTE_ROOT_PARENT, folderName),
    statePath: stateFilePath,
    ensuredDirs: new Set(state.dirs),
  };
}

async function ensureRemoteRoot(context: SyncContext, knownFiles: Record<string, FileMeta>): Promise<void> {
  if (context.ensuredDirs.has("")) return;

  if (!(await remotePathExists(context.remoteRoot))) {
    await createFolder(REMOTE_ROOT_PARENT, path.basename(context.config.localFolder));
  }

  context.ensuredDirs.add("");
  saveProgress(context, knownFiles);
}

async function ensureAllRemoteDirs(
  context: SyncContext,
  dirs: string[],
  knownFiles: Record<string, FileMeta>
): Promise<void> {
  for (const relativeDir of dirs) {
    await ensureRemoteDir(context, relativeDir, knownFiles);
  }
}

function logSummary(config: Config, checked: number, uploaded: number, trashed: number): void {
  const trashedNote = config.mirrorDeletes ? `, ${trashed} trashed` : "";

  console.log(`Sync complete: ${checked} local files checked, ${uploaded} uploaded${trashedNote}.`);
}

/** One full pass: make sure remote dirs exist, upload what changed, optionally trash what was deleted. */
export async function runSync(config: Config): Promise<void> {
  const stateFilePath = statePath(config.localFolder);
  const state = loadState(stateFilePath);
  const context = createContext(config, state, stateFilePath);
  const currentFiles: Record<string, FileMeta> = {};

  await ensureRemoteRoot(context, state.files);

  const { files, dirs } = listLocal(config.localFolder);
  await ensureAllRemoteDirs(context, dirs, state.files);

  const toUpload = planUploads(config.localFolder, files, state.files, currentFiles);
  const uploaded = await uploadChangedFiles(context, toUpload, currentFiles);
  const trashed = config.mirrorDeletes
    ? await trashDeletedFiles(context, state.files, currentFiles)
    : 0;

  saveProgress(context, currentFiles);
  logSummary(config, files.length, uploaded, trashed);
}
