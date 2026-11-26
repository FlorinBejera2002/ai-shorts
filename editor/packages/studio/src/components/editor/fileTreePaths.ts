/** The last segment of a project path ("a/b/c.html" -> "c.html"). */
export function leafName(path: string): string {
  return path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
}

/** The folder part of a project path ("a/b/c.html" -> "a/b"); "" at the root. */
export function parentOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}
