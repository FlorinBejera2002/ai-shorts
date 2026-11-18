import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ObjectProjectStore } from "./object-project-store";
import { ProjectStore } from "./store";
import { StateConflict, type StateObjects } from "./state-objects";

export class MemoryStateObjects implements StateObjects {
  readonly values = new Map<string, { bytes: Uint8Array; etag: string }>();
  failHead = false;
  async get(key: string) {
    const value = this.values.get(key);
    return value ? { ...value, bytes: value.bytes.slice() } : null;
  }
  async read(key: string) {
    const value = await this.get(key);
    return new Response(value ? Buffer.from(value.bytes) : null, { status: value ? 200 : 404 });
  }
  async put(key: string, body: string | Blob, expected: string | null) {
    if (this.failHead && key.includes("/heads/")) throw new Error("Storage unavailable");
    const prior = this.values.get(key);
    if ((prior?.etag ?? null) !== expected) throw new StateConflict();
    const etag = `"${randomUUID()}"`;
    this.values.set(key, {
      bytes:
        typeof body === "string"
          ? new TextEncoder().encode(body)
          : new Uint8Array(await body.arrayBuffer()),
      etag,
    });
    return etag;
  }
  async list(prefix: string) {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "studio-state-test-")));
  roots.push(root);
  const objects = new MemoryStateObjects(),
    owner = randomUUID(),
    id = randomUUID();
  const a = new ObjectProjectStore(join(root, "a"), objects, "editable");
  const b = new ObjectProjectStore(join(root, "b"), objects, "editable");
  const project = await a.ensure(owner, id, "Example", (p) =>
    writeFile(join(p.dir, "index.html"), "first"),
  );
  return { root, objects, owner, id, a, b, project };
}
test("restores source bytes, private history and exports after losing every cache", async () => {
  const { root, objects, owner, id, a, project } = await fixture();
  await mkdir(join(project.dir, "assets"));
  await mkdir(join(project.dir, "renders"));
  await mkdir(join(project.dir, ".cache"));
  await writeFile(join(project.dir, "assets/source.mp4"), new Uint8Array([0, 1, 255, 2]));
  await writeFile(join(project.dir, "renders/output.mp4"), "rendered output");
  await writeFile(join(project.dir, ".cache/disposable"), "discard");
  await a.save(owner, id);
  await a.publish(owner, id, "Published", (p) => writeFile(join(p.dir, "index.html"), "second"));
  await rm(a.root, { recursive: true });
  const restarted = new ObjectProjectStore(join(root, "restarted"), objects, "editable");
  const restored = (await restarted.resolve(owner, id))!;
  expect(await readFile(join(restored.dir, "index.html"), "utf8")).toBe("second");
  const container = join(restarted.root, owner, id);
  expect(await readFile(join(container, "assets/source.mp4"))).toEqual(Buffer.from([0, 1, 255, 2]));
  expect(await readFile(join(container, "renders/output.mp4"), "utf8")).toBe("rendered output");
  expect(await readdir(container)).not.toContain(".cache");
  expect((await restarted.list(owner)).map((p) => [p.id, p.title])).toEqual([[id, "Published"]]);
  expect([...objects.values.keys()].filter((key) => key.includes("/revisions/"))).toHaveLength(3);
});
test("two servers cannot silently overwrite the same base revision", async () => {
  const { owner, id, a, b, project } = await fixture();
  const other = (await b.resolve(owner, id))!;
  await writeFile(join(project.dir, "index.html"), "server a");
  await writeFile(join(other.dir, "index.html"), "server b");
  await a.save(owner, id);
  await expect(b.save(owner, id)).rejects.toBeInstanceOf(StateConflict);
  const restored = (await b.resolve(owner, id))!;
  expect(await readFile(join(restored.dir, "index.html"), "utf8")).toBe("server a");
});
test("streams files larger than one staging buffer without truncating or changing bytes", async () => {
  const { owner, id, a, b, project } = await fixture();
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 17);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  await writeFile(join(project.dir, "large-source.bin"), bytes);
  await a.save(owner, id);
  expect(await readFile(join((await b.resolve(owner, id))!.dir, "large-source.bin"))).toEqual(
    bytes,
  );
});
test("catalog reads do not materialize project media and background jobs cannot save a replaced cache", async () => {
  const { owner, id, a, b, project } = await fixture();
  expect((await b.catalog(owner)).map((project) => project.id)).toEqual([id]);
  expect(await Bun.file(join(b.root, owner, id, "index.html")).exists()).toBe(false);
  const checkpoint = a.checkpoint(owner, id);
  const other = (await b.resolve(owner, id))!;
  await writeFile(join(other.dir, "index.html"), "new remote content");
  await b.save(owner, id);
  await a.resolve(owner, id);
  await expect(Promise.resolve().then(checkpoint)).rejects.toBeInstanceOf(StateConflict);
  expect(await readFile(join(project.dir, "index.html"), "utf8")).toBe("new remote content");
});
test("publication uses the caller's base, including a competing publish before it starts", async () => {
  const { owner, id, a, b } = await fixture();
  await b.resolve(owner, id);
  await a.publish(owner, id, "A", (p) => writeFile(join(p.dir, "index.html"), "a"));
  await expect(
    b.publish(owner, id, "B", (p) => writeFile(join(p.dir, "index.html"), "b")),
  ).rejects.toBeInstanceOf(StateConflict);
  expect((await b.resolve(owner, id))?.title).toBe("A");
});
test("failed storage writes are not acknowledged or reused as durable state", async () => {
  const { owner, id, a, objects, project } = await fixture();
  await writeFile(join(project.dir, "index.html"), "unsaved");
  objects.failHead = true;
  await expect(a.save(owner, id)).rejects.toThrow("Storage unavailable");
  objects.failHead = false;
  const restored = (await a.resolve(owner, id))!;
  expect(await readFile(join(restored.dir, "index.html"), "utf8")).toBe("first");
});
test("same-size edits with a restored modification time still invalidate cached file hashes", async () => {
  const { owner, id, a, b, project } = await fixture();
  const file = join(project.dir, "index.html"),
    before = await lstat(file);
  await writeFile(file, "other");
  await utimes(file, before.atime, before.mtime);
  await a.save(owner, id);
  expect(await readFile(join((await b.resolve(owner, id))!.dir, "index.html"), "utf8")).toBe(
    "other",
  );
});
test("corrupt remote bytes fail restoration", async () => {
  const { owner, id, b, objects } = await fixture();
  const blob = [...objects.values.keys()].find((key) => key.includes("/blobs/"))!;
  objects.values.get(blob)!.bytes = new TextEncoder().encode("corrupt");
  await expect(b.resolve(owner, id)).rejects.toThrow();
});
test("rejects symlinks and preserves the preceding durable revision", async () => {
  const { owner, id, a, project } = await fixture();
  await symlink("index.html", join(project.dir, "link.html"));
  await expect(a.save(owner, id)).rejects.toThrow("Unsupported Studio state file");
  const restored = (await a.resolve(owner, id))!;
  expect(await readdir(restored.dir)).not.toContain("link.html");
});
test("deletion defeats stale saves; account fences survive complete cache loss", async () => {
  const { owner, id, a, b, project } = await fixture();
  await b.resolve(owner, id);
  await a.remove(owner, id);
  await expect(b.save(owner, id)).rejects.toBeInstanceOf(StateConflict);
  expect(await b.resolve(owner, id)).toBeNull();
  await a.disableOwner(owner);
  await rm(a.root, { recursive: true });
  await expect(b.ensure(owner, randomUUID(), "Recreate", async () => {})).rejects.toThrow(
    "deleted",
  );
  expect(project.id).toBe(id);
});
test("migration verifies imported bytes, preserves originals and is safely repeatable", async () => {
  const { root, objects, owner } = await fixture();
  const local = new ProjectStore(join(root, "legacy")),
    id = randomUUID();
  const original = await local.ensure(owner, id, "Original", (p) =>
    writeFile(join(p.dir, "index.html"), "original bytes"),
  );
  const target = new ObjectProjectStore(join(root, "import"), objects, "editable");
  await target.importLocal(owner, id, original.dir);
  await target.importLocal(owner, id, original.dir);
  expect(await readFile(join(original.dir, "index.html"), "utf8")).toBe("original bytes");
  await writeFile(join(original.dir, "index.html"), "different");
  await expect(target.importLocal(owner, id, original.dir)).rejects.toThrow("differs");
  expect(await readFile(join((await target.resolve(owner, id))!.dir, "index.html"), "utf8")).toBe(
    "original bytes",
  );
});
