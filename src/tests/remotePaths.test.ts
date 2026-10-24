import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeLocalPath, remoteChild, remotePathFor } from "../protonDrive/remotePaths";

test("remoteChild escapes glob characters and slashes in the name", () => {
  // Each special character in the name gets a backslash in front (written "\\" in a string).
  assert.equal(remoteChild("/my-files", "a[1]*?/b"), "/my-files/a\\[1\\]\\*\\?\\/b");
});

test("remoteChild does not double the slash after a root ending in /", () => {
  assert.equal(remoteChild("/", "docs"), "/docs");
});

test("remotePathFor joins every segment under the root", () => {
  assert.equal(remotePathFor("/my-files/x", "a/b[1]/c.txt"), "/my-files/x/a/b\\[1\\]/c.txt");
});

test("remotePathFor returns the root for an empty or dot path", () => {
  assert.equal(remotePathFor("/my-files/x", ""), "/my-files/x");
  assert.equal(remotePathFor("/my-files/x", "."), "/my-files/x");
});

test("escapeLocalPath keeps directory separators", () => {
  assert.equal(escapeLocalPath("/home/me/a[1]/b.txt"), "/home/me/a\\[1\\]/b.txt");
});
