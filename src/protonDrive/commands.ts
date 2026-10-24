import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { escapeLocalPath } from "./remotePaths";

const execFileAsync = promisify(execFile);
const PROTON_DRIVE_BINARY = "proton-drive";
const FILESYSTEM_COMMAND = "filesystem";
const MAX_BUFFER_MEGABYTES = 100; // large directory listings overflow the default buffer
const BYTES_PER_MEGABYTE = 1024 * 1024;
const NOT_FOUND_PATTERN = /node not found/i; // what `filesystem info` prints for a missing path
const ALREADY_EXISTS_PATTERN = /already exists/i; // case-insensitive match on the CLI's error text

async function runFilesystem(args: string[]): Promise<void> {
  await execFileAsync(PROTON_DRIVE_BINARY, [FILESYSTEM_COMMAND, ...args], {
    maxBuffer: MAX_BUFFER_MEGABYTES * BYTES_PER_MEGABYTE,
  });
}

export async function remotePathExists(remotePath: string): Promise<boolean> {
  try {
    await runFilesystem(["info", remotePath, "-j"]);
    return true;
  } catch (error) {
    if (NOT_FOUND_PATTERN.test(errorMessage(error))) return false;

    throw error; // auth/network problems must not be mistaken for "missing"
  }
}

export async function createFolder(parentPath: string, name: string): Promise<void> {
  try {
    await runFilesystem(["create-folder", parentPath, name]);
  } catch (error) {
    // Ignore "already exists" races (e.g. created by a concurrent run).
    if (!ALREADY_EXISTS_PATTERN.test(errorMessage(error))) {
      throw error;
    }
  }
}

export async function uploadFile(
  localPath: string,
  remoteParentPath: string,
  conflictStrategy: string
): Promise<void> {
  await runFilesystem([
    "upload",
    "-f",
    conflictStrategy,
    "-t",
    escapeLocalPath(localPath),
    remoteParentPath,
  ]);
}

export async function trash(remotePath: string): Promise<void> {
  await runFilesystem(["trash", remotePath]);
}

/** execFile errors carry the CLI's own output in stderr/stdout, which is more useful than `message`. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const details = error as { stderr?: string; stdout?: string; message?: string };

    return details.stderr || details.stdout || details.message || String(error);
  }

  return String(error);
}
