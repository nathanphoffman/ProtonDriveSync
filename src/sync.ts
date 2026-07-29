import * as fs from "node:fs";
import * as path from "node:path";
import { Config } from "./config";
import { listLocal } from "./sync/localScan";
import {
  errorMessage,
  remoteChild,
  remotePathExists,
  remotePathFor,
  createFolder,
  trash,
  uploadFile,
} from "./protonDriveCli";
import { ensureRemoteDir } from "./sync/remoteDirs";
import { FileMeta, loadState, saveState } from "./sync/state";

const REMOTE_ROOT_PARENT = "/my-files";
const UPLOAD_BACKOFF_STEP_MS = 10;
const UPLOAD_BACKOFF_MAX_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSync(config: Config): Promise<void> {
  const folderName = path.basename(config.localFolder);
  const remoteRoot = remoteChild(REMOTE_ROOT_PARENT, folderName);

  const state = loadState(config.localFolder);
  const ensuredDirs = new Set(state.dirs);
  const previousFiles = state.files;
  const currentFiles: Record<string, FileMeta> = {};

  if (!ensuredDirs.has("")) {
    if (!(await remotePathExists(remoteRoot))) {
      await createFolder(REMOTE_ROOT_PARENT, folderName);
    }
    ensuredDirs.add("");
    saveState(config.localFolder, { files: previousFiles, dirs: Array.from(ensuredDirs) });
  }

  const { files, dirs } = listLocal(config.localFolder);

  for (const relDir of dirs) {
    await ensureRemoteDir(config.localFolder, remoteRoot, relDir, ensuredDirs, previousFiles);
  }

  // Scan first: split into unchanged (skip) vs. needing upload, so we know the
  // total up front and can report progress against it.
  const toUpload: { rel: string; full: string; st: fs.Stats }[] = [];
  for (const rel of files) {
    const full = path.join(config.localFolder, ...rel.split("/"));
    const st = fs.statSync(full);
    const prev = previousFiles[rel];
    const changed = !prev || prev.size !== st.size || prev.mtimeMs !== st.mtimeMs;

    if (!changed) {
      currentFiles[rel] = prev;
    } else {
      toUpload.push({ rel, full, st });
    }
  }

  const totalToUpload = toUpload.length;
  console.log(
    `Scanned ${files.length} local files: ${totalToUpload} to upload, ` +
      `${files.length - totalToUpload} unchanged.`
  );

  let uploaded = 0;
  for (const { rel, full, st } of toUpload) {
    // Growing delay so a huge first sync doesn't hammer the API; safe to
    // Ctrl+C and rerun since state is saved after each successful upload.
    const delayMs = Math.min(uploaded * UPLOAD_BACKOFF_STEP_MS, UPLOAD_BACKOFF_MAX_MS);
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const relDir = path.posix.dirname(rel);
    const remoteParent = relDir === "." ? remoteRoot : remotePathFor(remoteRoot, relDir);
    console.log(`Uploading (${uploaded + 1}/${totalToUpload}): ${rel}`);
    try {
      await uploadFile(full, remoteParent, "replace");
      uploaded++;
      currentFiles[rel] = { size: st.size, mtimeMs: st.mtimeMs };
      console.log(`Uploaded (${uploaded}/${totalToUpload}): ${rel}`);
      saveState(config.localFolder, { files: currentFiles, dirs: Array.from(ensuredDirs) });
    } catch (err) {
      console.error(`Failed to upload (${uploaded}/${totalToUpload}) ${rel}: ${errorMessage(err)}`);
    }
  }

  let trashed = 0;
  if (config.mirrorDeletes) {
    for (const rel of Object.keys(previousFiles)) {
      if (rel in currentFiles) continue;
      const relDir = path.posix.dirname(rel);
      const name = path.posix.basename(rel);
      const remoteParent = relDir === "." ? remoteRoot : remotePathFor(remoteRoot, relDir);
      const remotePath = remoteChild(remoteParent, name);
      try {
        await trash(remotePath);
        trashed++;
        delete previousFiles[rel];
        console.log(`Trashed remote (removed locally): ${rel}`);
        saveState(config.localFolder, { files: previousFiles, dirs: Array.from(ensuredDirs) });
      } catch (err) {
        console.error(`Failed to trash ${rel}: ${errorMessage(err)}`);
      }
    }
  }

  saveState(config.localFolder, { files: currentFiles, dirs: Array.from(ensuredDirs) });

  console.log(
    `Sync complete: ${files.length} local files checked, ${uploaded} uploaded` +
      (config.mirrorDeletes ? `, ${trashed} trashed` : "") +
      "."
  );
}
