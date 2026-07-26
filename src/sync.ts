import * as fs from "node:fs";
import * as path from "node:path";
import { Config } from "./config";
import {
  createFolder,
  errorMessage,
  remoteChild,
  remotePathExists,
  remotePathFor,
  trash,
  uploadFile,
} from "./protonDriveCli";

const REMOTE_ROOT_PARENT = "/my-files";
const UPLOAD_BACKOFF_STEP_MS = 10;
const UPLOAD_BACKOFF_MAX_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FileMeta {
  size: number;
  mtimeMs: number;
}

interface State {
  files: Record<string, FileMeta>;
  dirs: string[];
}

function statePath(localFolder: string): string {
  const hash = Buffer.from(localFolder).toString("base64url");
  return path.join(__dirname, "..", ".sync-state", `${hash}.json`);
}

function loadState(localFolder: string): State {
  const p = statePath(localFolder);
  if (!fs.existsSync(p)) return { files: {}, dirs: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    return { files: parsed.files ?? {}, dirs: parsed.dirs ?? [] };
  } catch {
    return { files: {}, dirs: [] };
  }
}

function saveState(localFolder: string, state: State): void {
  const p = statePath(localFolder);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

function listLocal(root: string): { files: string[]; dirs: string[] } {
  const files: string[] = [];
  const dirs: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        dirs.push(rel);
        walk(full);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  }

  walk(root);
  return { files, dirs };
}

async function ensureRemoteDir(
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
