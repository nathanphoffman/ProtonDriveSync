import * as fs from "node:fs";
import * as path from "node:path";

export function listLocal(root: string): { files: string[]; dirs: string[] } {
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
