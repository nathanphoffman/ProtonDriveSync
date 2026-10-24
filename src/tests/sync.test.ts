import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { parseConfig } from "../config/config";
import { listLocal } from "../sync/localScan";
import { planUploads } from "../sync/uploads";

function makeTempFolder(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "proton-sync-test-"));
}

test("listLocal returns posix-style relative files and directories", () => {
  const root = makeTempFolder();
  fs.mkdirSync(path.join(root, "sub"));
  fs.writeFileSync(path.join(root, "sub", "a.txt"), "a");
  fs.writeFileSync(path.join(root, "b.txt"), "b");

  const { files, dirs } = listLocal(root);

  assert.deepEqual(files.sort(), ["b.txt", "sub/a.txt"]);
  assert.deepEqual(dirs, ["sub"]);
});

test("planUploads skips unchanged files and queues new or changed ones", () => {
  const root = makeTempFolder();
  fs.writeFileSync(path.join(root, "same.txt"), "same");
  fs.writeFileSync(path.join(root, "new.txt"), "new");
  const stats = fs.statSync(path.join(root, "same.txt"));
  const previous = { "same.txt": { size: stats.size, mtimeMs: stats.mtimeMs } };
  const current: Record<string, { size: number; mtimeMs: number }> = {};

  const toUpload = planUploads(root, ["same.txt", "new.txt"], previous, current);

  assert.deepEqual(toUpload.map((item) => item.relativePath), ["new.txt"]);
  assert.deepEqual(Object.keys(current), ["same.txt"]);
});

test("parseConfig applies defaults for optional fields", () => {
  const config = parseConfig({ localFolder: makeTempFolder() });

  assert.equal(config.watch, true);
  assert.equal(config.mirrorDeletes, false);
  assert.equal(config.pollIntervalSeconds, 300);
});

test("parseConfig rejects a missing localFolder", () => {
  assert.throws(() => parseConfig({}), /localFolder/);
});

test("parseConfig rejects a folder that does not exist", () => {
  assert.throws(() => parseConfig({ localFolder: "/definitely/not/here" }), /does not exist/);
});
