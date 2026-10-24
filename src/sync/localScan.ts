import * as fs from "node:fs";
import * as path from "node:path";

export interface LocalListing {
  files: string[];
  dirs: string[];
}

/** List every file and directory under root as posix-style paths relative to root. */
export function listLocal(root: string): LocalListing {
  const listing: LocalListing = { files: [], dirs: [] };

  walk(root, root, listing);

  return listing;
}

// Recursive so nested folders are found; only plain files and directories are kept (symlinks and other types are skipped).
function walk(root: string, directory: string, listing: LocalListing): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");

    if (entry.isDirectory()) {
      listing.dirs.push(relativePath);
      walk(root, fullPath, listing);
    } else if (entry.isFile()) {
      listing.files.push(relativePath);
    }
  }
}
