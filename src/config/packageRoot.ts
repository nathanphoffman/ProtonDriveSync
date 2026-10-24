import * as fs from "node:fs";
import * as path from "node:path";

// Walk up from a starting directory to find the package root (nearest
// package.json), rather than assuming a fixed relative depth via __dirname.
// A fixed relative depth silently breaks if a file moves to a different
// nesting level, which shifts any path resolved from it.
export function findPackageRoot(startDirectory: string): string {
  let currentDirectory = startDirectory;

  while (true) {
    if (fs.existsSync(path.join(currentDirectory, "package.json"))) return currentDirectory;

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) return startDirectory; // reached filesystem root; give up

    currentDirectory = parentDirectory;
  }
}
