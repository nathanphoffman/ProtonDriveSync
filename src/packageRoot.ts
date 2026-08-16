import * as fs from "node:fs";
import * as path from "node:path";

// Walk up from a starting directory to find the package root (nearest
// package.json), rather than assuming a fixed relative depth via __dirname.
// A fixed relative depth silently breaks if a file moves to a different
// nesting level, which shifts any path resolved from it.
export function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return startDir; // reached filesystem root; give up
    dir = parent;
  }
}
