import * as fs from "node:fs";
import * as path from "node:path";

export interface FileMeta {
  size: number;
  mtimeMs: number;
}

export interface State {
  files: Record<string, FileMeta>;
  dirs: string[];
}

export function statePath(localFolder: string): string {
  const hash = Buffer.from(localFolder).toString("base64url");
  return path.join(__dirname, "..", ".sync-state", `${hash}.json`);
}

export function loadState(localFolder: string): State {
  const p = statePath(localFolder);
  if (!fs.existsSync(p)) return { files: {}, dirs: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    return { files: parsed.files ?? {}, dirs: parsed.dirs ?? [] };
  } catch {
    return { files: {}, dirs: [] };
  }
}

export function saveState(localFolder: string, state: State): void {
  const p = statePath(localFolder);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}
