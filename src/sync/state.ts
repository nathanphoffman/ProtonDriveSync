import * as fs from "node:fs";
import * as path from "node:path";
import type { Config } from "../config/config";
import { findPackageRoot } from "../config/packageRoot";

export interface FileMeta {
  size: number;
  mtimeMs: number;
}

export interface State {
  files: Record<string, FileMeta>;
  dirs: string[];
}

/** Everything one sync run shares: where it syncs from/to and which remote dirs are known to exist. */
export interface SyncContext {
  config: Config;
  remoteRoot: string;
  statePath: string;
  ensuredDirs: Set<string>;
}

const PACKAGE_ROOT = findPackageRoot(__dirname);
const STATE_FOLDER_NAME = ".sync-state";
const JSON_INDENT_SPACES = 2;

export function statePath(localFolder: string): string {
  const encodedFolder = Buffer.from(localFolder).toString("base64url");

  return path.join(PACKAGE_ROOT, STATE_FOLDER_NAME, `${encodedFolder}.json`);
}

/** Start from empty state on a missing or corrupt file: re-uploading everything is safer than failing to start. */
export function loadState(filePath: string): State {
  if (!fs.existsSync(filePath)) return { files: {}, dirs: [] };

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    return { files: parsed.files ?? {}, dirs: parsed.dirs ?? [] };
  } catch (error) {
    console.warn(`Ignoring unreadable sync state at ${filePath}: ${String(error)}`);

    return { files: {}, dirs: [] };
  }
}

export function saveState(filePath: string, state: State): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, JSON_INDENT_SPACES));
}

/** Save after each remote change so an interrupted run can resume where it stopped. */
export function saveProgress(context: SyncContext, files: Record<string, FileMeta>): void {
  saveState(context.statePath, { files, dirs: Array.from(context.ensuredDirs) });
}
