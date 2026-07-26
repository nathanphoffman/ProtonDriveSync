import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BIN = "proton-drive";
const MAX_BUFFER = 1024 * 1024 * 100; // 100MB, for large directory listings

/** Escape a single path segment for use inside a proton-drive remote path (proton-drive treats
 * `/ [ ] * ? \` as glob metacharacters, so literal occurrences must be backslash-escaped). */
function escapeSegment(name: string): string {
  return name.replace(/[\\/[\]*?]/g, "\\$&");
}

/** Escape a real filesystem path passed to proton-drive (e.g. `-t`), which glob-matches its
 * argument too. Directory separators are left alone since this is an actual path, not a segment. */
function escapeLocalPath(localPath: string): string {
  return localPath.replace(/[\\[\]*?]/g, "\\$&");
}

/** Append one literal name (not itself a path) as a child of a remote path. */
export function remoteChild(parentPath: string, name: string): string {
  const base = parentPath.endsWith("/") ? parentPath.slice(0, -1) : parentPath;
  return `${base}/${escapeSegment(name)}`;
}

/** Build a full remote path from a root and a posix-style relative path of one or more segments. */
export function remotePathFor(root: string, relPosixPath: string): string {
  if (relPosixPath === "" || relPosixPath === ".") return root;
  let current = root;
  for (const segment of relPosixPath.split("/")) {
    current = remoteChild(current, segment);
  }
  return current;
}

export async function remotePathExists(remotePath: string): Promise<boolean> {
  try {
    await execFileAsync(BIN, ["filesystem", "info", remotePath, "-j"], {
      maxBuffer: MAX_BUFFER,
    });
    return true;
  } catch {
    return false;
  }
}

export async function createFolder(parentPath: string, name: string): Promise<void> {
  try {
    await execFileAsync(BIN, ["filesystem", "create-folder", parentPath, name], {
      maxBuffer: MAX_BUFFER,
    });
  } catch (err) {
    // Ignore "already exists" races (e.g. created by a concurrent run).
    const message = errorMessage(err);
    if (!/already exists/i.test(message)) {
      throw err;
    }
  }
}

export async function uploadFile(
  localPath: string,
  remoteParentPath: string,
  conflictStrategy: string
): Promise<void> {
  await execFileAsync(
    BIN,
    ["filesystem", "upload", "-f", conflictStrategy, "-t", escapeLocalPath(localPath), remoteParentPath],
    { maxBuffer: MAX_BUFFER }
  );
}

export async function trash(remotePath: string): Promise<void> {
  await execFileAsync(BIN, ["filesystem", "trash", remotePath], { maxBuffer: MAX_BUFFER });
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const anyErr = err as { stderr?: string; stdout?: string; message?: string };
    return anyErr.stderr || anyErr.stdout || anyErr.message || String(err);
  }
  return String(err);
}
