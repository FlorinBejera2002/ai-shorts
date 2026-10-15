import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

const gates = new Map<string, Promise<void>>();
const backgroundWrites = new Map<string, Set<Promise<void>>>();
export const EMPTY_WORKSPACE_REVISION = "absent";
const excluded = new Set([
  "renders",
  "node_modules",
  ".git",
  ".revisions",
  ".sneepcut-project.json",
  ".thumbnails",
  ".waveform-cache",
  ".transcode-cache",
  ".cache",
]);
export const workspaceFileIncluded = (name: string) => !excluded.has(name);

/** The same gate covers browser requests, service snapshots and head publication. */
export async function withWorkspace<T>(
  owner: string,
  id: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `${owner}/${id}`;
  const previous = gates.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  gates.set(key, gate);
  await previous;
  try {
    await Promise.allSettled([...(backgroundWrites.get(key) ?? [])]);
    return await operation();
  } finally {
    release();
    if (gates.get(key) === gate) gates.delete(key);
  }
}

/** Background media operations finish writing before the next snapshot or publish. */
export function trackWorkspaceWrite(owner: string, id: string, settled: Promise<void>): void {
  const key = `${owner}/${id}`;
  const pending = backgroundWrites.get(key) ?? new Set<Promise<void>>();
  pending.add(settled);
  backgroundWrites.set(key, pending);
  void settled
    .finally(() => {
      pending.delete(settled);
      if (!pending.size) backgroundWrites.delete(key);
    })
    .catch(() => {});
}

/** Strong revision of every source byte, including nested documents and saved manifests. */
export async function workspaceRevision(directory: string): Promise<string> {
  const hash = createHash("sha256");
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const name of (await readdir(dir)).sort()) {
      if (!workspaceFileIncluded(name)) continue;
      const path = join(dir, name);
      const relative = `${prefix}${name}`;
      const info = await lstat(path);
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory()))
        throw new Error("Unsupported workspace file");
      if (info.isDirectory()) {
        await walk(path, `${relative}/`);
        continue;
      }
      hash.update(`${relative}\0${info.size}\0`);
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      hash.update("\0");
    }
  }
  await walk(directory, "");
  return `sha256:${hash.digest("hex")}`;
}
