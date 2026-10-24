import * as fs from "node:fs";
import * as path from "node:path";
import { errorMessage, uploadFile } from "../protonDrive/commands";
import { remotePathFor } from "../protonDrive/remotePaths";
import { type FileMeta, saveProgress, type SyncContext } from "./state";

const UPLOAD_CONFLICT_STRATEGY = "replace";
const UPLOAD_BACKOFF_STEP_MS = 10;
const UPLOAD_BACKOFF_MAX_MS = 15_000;

export interface PendingUpload {
  relativePath: string;
  fullPath: string;
  stats: fs.Stats;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasChanged(previous: FileMeta | undefined, stats: fs.Stats): boolean {
  return !previous || previous.size !== stats.size || previous.mtimeMs !== stats.mtimeMs;
}

/**
 * Scan first: split into unchanged (carried into currentFiles) vs. needing upload,
 * so we know the total up front and can report progress against it.
 */
export function planUploads(
  localFolder: string,
  files: string[],
  previousFiles: Record<string, FileMeta>,
  currentFiles: Record<string, FileMeta>
): PendingUpload[] {
  const toUpload: PendingUpload[] = [];

  for (const relativePath of files) {
    const fullPath = path.join(localFolder, ...relativePath.split("/"));
    const stats = fs.statSync(fullPath);
    const previous = previousFiles[relativePath];

    if (hasChanged(previous, stats)) {
      toUpload.push({ relativePath, fullPath, stats });
    } else {
      currentFiles[relativePath] = previous;
    }
  }

  console.log(
    `Scanned ${files.length} local files: ${toUpload.length} to upload, ` +
      `${files.length - toUpload.length} unchanged.`
  );

  return toUpload;
}

async function uploadOne(context: SyncContext, pending: PendingUpload, progress: string): Promise<boolean> {
  const remoteParent = remotePathFor(context.remoteRoot, path.posix.dirname(pending.relativePath));

  try {
    await uploadFile(pending.fullPath, remoteParent, UPLOAD_CONFLICT_STRATEGY);

    return true;
  } catch (error) {
    console.error(`Failed to upload (${progress}) ${pending.relativePath}: ${errorMessage(error)}`);

    return false;
  }
}

/** Upload each pending file, returning how many succeeded; failures are logged and skipped. */
export async function uploadChangedFiles(
  context: SyncContext,
  toUpload: PendingUpload[],
  currentFiles: Record<string, FileMeta>
): Promise<number> {
  let uploaded = 0;

  for (const pending of toUpload) {
    // Growing delay so a huge first sync doesn't hammer the API; safe to
    // Ctrl+C and rerun since state is saved after each successful upload.
    await sleep(Math.min(uploaded * UPLOAD_BACKOFF_STEP_MS, UPLOAD_BACKOFF_MAX_MS));

    console.log(`Uploading (${uploaded + 1}/${toUpload.length}): ${pending.relativePath}`);
    if (!(await uploadOne(context, pending, `${uploaded}/${toUpload.length}`))) continue;

    uploaded++;
    currentFiles[pending.relativePath] = { size: pending.stats.size, mtimeMs: pending.stats.mtimeMs };
    console.log(`Uploaded (${uploaded}/${toUpload.length}): ${pending.relativePath}`);
    saveProgress(context, currentFiles);
  }

  return uploaded;
}
