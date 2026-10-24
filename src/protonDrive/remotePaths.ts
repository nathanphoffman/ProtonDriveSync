// proton-drive glob-matches the paths it is given, so literal glob characters
// must be backslash-escaped. Both regexes match one such character and the
// replacement "\\$&" puts a backslash in front of whatever was matched.
const SEGMENT_GLOB_CHARACTERS = /[\\/[\]*?]/g;
const LOCAL_PATH_GLOB_CHARACTERS = /[\\[\]*?]/g;

/** Escape one path segment; `/` is escaped too because a segment is never a path. */
function escapeSegment(name: string): string {
  return name.replace(SEGMENT_GLOB_CHARACTERS, "\\$&");
}

/** Escape a real filesystem path (e.g. for `-t`); separators stay, since this is a whole path. */
export function escapeLocalPath(localPath: string): string {
  return localPath.replace(LOCAL_PATH_GLOB_CHARACTERS, "\\$&");
}

function trimTrailingSlash(remotePath: string): string {
  return remotePath.endsWith("/") ? remotePath.slice(0, -1) : remotePath;
}

/** Append one literal name (not itself a path) as a child of a remote path. */
export function remoteChild(parentPath: string, name: string): string {
  return `${trimTrailingSlash(parentPath)}/${escapeSegment(name)}`;
}

/** Build a full remote path from a root and a posix-style relative path of one or more segments. */
export function remotePathFor(root: string, relativePosixPath: string): string {
  if (relativePosixPath === "" || relativePosixPath === ".") return root;

  const segments = relativePosixPath.split("/").map(escapeSegment);

  return [trimTrailingSlash(root), ...segments].join("/");
}
