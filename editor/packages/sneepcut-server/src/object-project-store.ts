import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, type Stats } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { HTTPException } from "hono/http-exception";
import { ProjectStore, isUUID, type StoredProject } from "./store";
import { StateConflict, type StateObjects } from "./state-objects";

interface FileEntry {
  path: string;
  hash: string;
  size: number;
}
interface Manifest {
  version: 1;
  previous: string | null;
  files: FileEntry[];
  directories: string[];
}
interface Head {
  revision: string | null;
  etag: string;
  title?: string;
  generation?: string;
}
interface VerifiedFile {
  fingerprint: string;
  entry: FileEntry;
}
const fingerprint = (info: Stats) =>
  `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
const disposable = new Set([
  "node_modules",
  ".git",
  ".cache",
  ".thumbnails",
  ".waveform-cache",
  ".transcode-cache",
]);
const validPath = (path: string) =>
  path.length > 0 &&
  path.length <= 4096 &&
  !path.includes("\\") &&
  !path.includes("\0") &&
  path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function stageFile(source: string, destination: string, size: number): Promise<string> {
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let copied = 0;
  try {
    const output = await open(destination, "wx", 0o600);
    try {
      while (true) {
        const { bytesRead } = await input.read(buffer);
        if (!bytesRead) break;
        copied += bytesRead;
        if (copied > size) throw new StateConflict();
        const chunk = buffer.subarray(0, bytesRead);
        hash.update(chunk);
        await output.writeFile(chunk);
      }
      if (copied !== size) throw new StateConflict();
      return hash.digest("hex");
    } finally {
      await output.close();
    }
  } finally {
    await input.close();
  }
}
function assertID(value: string) {
  if (!isUUID(value)) throw new Error("Invalid Studio state identifier");
}

/** Per-project immutable manifests, with one conditional head update as the commit point. */
export class ObjectProjectStore extends ProjectStore {
  private readonly known = new Map<string, Head | null>();
  private readonly invalid = new Set<string>();
  private readonly gates = new Map<string, Promise<void>>();
  private readonly localOnly = new Set<string>();
  private readonly cacheGenerations = new Map<string, string>();
  private readonly verifiedFiles = new Map<string, Map<string, VerifiedFile>>();
  constructor(
    root: string,
    readonly objects: StateObjects,
    readonly namespace: string,
    readonly prefix = "studio/v1",
    private readonly maxBytes = 2 * 1024 ** 3,
  ) {
    super(root);
    if (!/^[a-z0-9-]+$/.test(namespace) || !validPath(prefix))
      throw new Error("Invalid Studio state prefix");
  }
  private ownerPrefix(owner: string) {
    assertID(owner);
    return `${this.prefix}/owners/${owner}/`;
  }
  private base(owner: string) {
    return `${this.ownerPrefix(owner)}${this.namespace}/`;
  }
  private data(owner: string, id: string) {
    assertID(id);
    return `${this.base(owner)}projects/${id}/`;
  }
  private headKey(owner: string, id: string) {
    assertID(id);
    return `${this.base(owner)}heads/${id}.json`;
  }
  private fence(owner: string) {
    assertID(owner);
    return `${this.prefix}/deleted-owners/${owner}`;
  }
  private async locked<T>(owner: string, id: string, operation: () => Promise<T>): Promise<T> {
    const key = `${owner}/${id}`;
    const previous = this.gates.get(key) ?? Promise.resolve();
    const { promise, resolve } = Promise.withResolvers<void>();
    this.gates.set(key, promise);
    await previous;
    try {
      return await operation();
    } finally {
      resolve();
      if (this.gates.get(key) === promise) this.gates.delete(key);
    }
  }
  override async ownerDisabled(owner: string) {
    return !!(await this.objects.get(this.fence(owner))) || (await super.ownerDisabled(owner));
  }
  override async disableOwner(owner: string) {
    try {
      await this.objects.put(this.fence(owner), "deleted\n", null);
    } catch (error) {
      if (!(error instanceof StateConflict)) throw error;
    }
    await super.disableOwner(owner);
  }
  private async available(owner: string) {
    if (await this.ownerDisabled(owner))
      throw new HTTPException(410, { message: "Studio account has been deleted" });
  }
  private async head(owner: string, id: string): Promise<Head | null> {
    const object = await this.objects.get(this.headKey(owner, id));
    if (!object) return null;
    const value = JSON.parse(new TextDecoder().decode(object.bytes));
    if (
      value.version !== 1 ||
      (value.revision !== null && !isUUID(value.revision)) ||
      (value.title !== undefined && typeof value.title !== "string") ||
      (value.generation !== undefined && !isUUID(value.generation))
    )
      throw new Error("Invalid Studio state head");
    return {
      revision: value.revision,
      etag: object.etag,
      title: value.title,
      generation: value.generation,
    };
  }
  private async manifest(owner: string, id: string, revision: string): Promise<Manifest> {
    const object = await this.objects.get(`${this.data(owner, id)}revisions/${revision}.json`);
    if (!object) throw new Error("Studio state revision is missing");
    const value = JSON.parse(new TextDecoder().decode(object.bytes));
    if (
      value.version !== 1 ||
      !Array.isArray(value.files) ||
      !Array.isArray(value.directories) ||
      value.files.length + value.directories.length > 100_000 ||
      value.directories.some((path: unknown) => typeof path !== "string" || !validPath(path)) ||
      value.files.some(
        (entry: FileEntry) =>
          !entry ||
          typeof entry.path !== "string" ||
          !validPath(entry.path) ||
          !/^[a-f0-9]{64}$/.test(entry.hash) ||
          !Number.isSafeInteger(entry.size) ||
          entry.size < 0,
      ) ||
      value.files.reduce((total: number, entry: FileEntry) => total + entry.size, 0) > this.maxBytes
    )
      throw new Error("Invalid Studio state manifest");
    return value;
  }
  private async hydrate(owner: string, id: string, head: Head) {
    const manifest = await this.manifest(owner, id, head.revision!);
    const parent = await super.userHome(owner);
    const temporary = await mkdtemp(join(parent, `.prepare-${id}-`));
    const destination = join(parent, id);
    const replaced = join(parent, `.discard-${id}-${randomUUID()}`);
    try {
      for (const path of manifest.directories)
        await mkdir(join(temporary, path), { recursive: true });
      for (const file of manifest.files) {
        const response = await this.objects.read(`${this.data(owner, id)}blobs/${file.hash}`);
        if (!response.ok || !response.body) throw new Error("Studio state file is missing");
        await mkdir(dirname(join(temporary, file.path)), { recursive: true });
        const output = await open(join(temporary, file.path), "wx", 0o600);
        const hash = createHash("sha256");
        let size = 0;
        try {
          for await (const chunk of response.body) {
            size += chunk.length;
            if (size > file.size) throw new Error("Studio state file is too large");
            hash.update(chunk);
            await output.writeFile(chunk);
          }
        } finally {
          await output.close();
        }
        if (size !== file.size || hash.digest("hex") !== file.hash)
          throw new Error("Studio state file failed integrity verification");
      }
      await this.available(owner);
      const parsed = JSON.parse(await readFile(join(temporary, ".sneepcut-project.json"), "utf8"));
      if (parsed.id !== id) throw new Error("Studio state belongs to a different project");
      try {
        await rename(destination, replaced);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      try {
        await rename(temporary, destination);
      } catch (error) {
        await rename(replaced, destination).catch(() => {});
        throw error;
      }
      const verified = new Map<string, VerifiedFile>();
      for (const entry of manifest.files)
        verified.set(entry.path, {
          entry,
          fingerprint: fingerprint(await lstat(join(destination, entry.path))),
        });
      this.verifiedFiles.set(`${owner}/${id}`, verified);
    } finally {
      await rm(temporary, { recursive: true, force: true });
      await rm(replaced, { recursive: true, force: true });
    }
  }
  override async resolve(owner: string, id: string): Promise<StoredProject | null> {
    assertID(owner);
    if (!isUUID(id)) return null;
    await this.available(owner);
    const key = `${owner}/${id}`;
    if (this.localOnly.has(key)) return super.resolve(owner, id);
    const head = await this.head(owner, id);
    if (!head?.revision) {
      // Only the dedicated cache is discarded; migration never uses it as the source.
      const parent = await super.userHome(owner);
      const destination = join(parent, id);
      try {
        if ((await lstat(destination)).isSymbolicLink())
          throw new Error("Unsafe Studio cache directory");
        await rm(destination, { recursive: true, force: true });
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      this.known.set(key, head);
      this.verifiedFiles.delete(key);
      this.cacheGenerations.set(key, randomUUID());
      this.invalid.delete(key);
      return null;
    }
    if (
      this.invalid.has(key) ||
      this.known.get(key)?.etag !== head.etag ||
      !(await super.resolve(owner, id))
    ) {
      await this.hydrate(owner, id, head);
      this.cacheGenerations.set(key, randomUUID());
    }
    this.known.set(key, head);
    this.invalid.delete(key);
    const project = await super.resolve(owner, id);
    return project ? { ...project, cacheKey: this.cacheGenerations.get(key) } : null;
  }
  override async list(owner: string): Promise<StoredProject[]> {
    const result: StoredProject[] = [];
    for (const entry of await this.catalog(owner)) {
      const project = await this.resolve(owner, entry.id);
      if (project) result.push(project);
    }
    return result;
  }
  override async catalog(owner: string): Promise<StoredProject[]> {
    await this.available(owner);
    const prefix = `${this.base(owner)}heads/`;
    const result: StoredProject[] = [];
    for (const key of await this.objects.list(prefix)) {
      const id = key.slice(prefix.length).replace(/\.json$/, "");
      if (!isUUID(id)) continue;
      const head = await this.head(owner, id);
      if (!head?.revision) continue;
      if (head.title === undefined) {
        const project = await this.resolve(owner, id);
        if (project) result.push(project);
      } else
        result.push({
          id,
          title: head.title,
          dir: head.generation
            ? join(this.root, owner, id, ".revisions", head.generation)
            : join(this.root, owner, id),
        });
    }
    return result;
  }
  private async flush(owner: string, id: string, importOnly = false) {
    const key = `${owner}/${id}`;
    if (!this.known.has(key)) throw new Error("Resolve Studio state before saving it");
    const expected = this.known.get(key) ?? null;
    const source = join(this.root, owner, id);
    const temporary = await mkdtemp(join(tmpdir(), "studio-state-"));
    const files: FileEntry[] = [],
      directories: string[] = [];
    const verified = new Map<string, VerifiedFile>();
    let size = 0;
    try {
      await this.available(owner);
      if ((await this.head(owner, id))?.etag !== expected?.etag) throw new StateConflict();
      const old = expected?.revision
        ? await this.manifest(owner, id, expected.revision)
        : undefined;
      const existing = new Set(old?.files.map((file) => file.hash));
      const walk = async (path: string, relative: string): Promise<void> => {
        for (const name of (await readdir(path)).sort()) {
          if (disposable.has(name) || name.startsWith(".head-") || name.startsWith(".prepare-"))
            continue;
          const from = join(path, name),
            to = relative ? `${relative}/${name}` : name;
          if (!validPath(to)) throw new Error("Unsupported Studio file path");
          const info = await lstat(from);
          if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
            throw new Error("Unsupported Studio state file");
          if (info.isDirectory()) {
            directories.push(to);
            await walk(from, to);
          } else {
            size += info.size;
            if (size > this.maxBytes || files.length + directories.length >= 100_000)
              throw new Error("Studio state exceeds the project storage limit");
            const cached = this.verifiedFiles.get(key)?.get(to);
            if (cached?.fingerprint === fingerprint(info) && existing.has(cached.entry.hash)) {
              files.push(cached.entry);
              verified.set(to, cached);
              continue;
            }
            const copy = join(temporary, String(files.length));
            const hash = await stageFile(from, copy, info.size);
            const after = await lstat(from);
            if (!after.isFile() || after.isSymbolicLink() || info.size !== after.size)
              throw new StateConflict();
            if (hash !== (await sha256(from))) throw new StateConflict();
            const entry = { path: to, hash, size: info.size };
            files.push(entry);
            const final = await lstat(from);
            if (fingerprint(after) === fingerprint(final))
              verified.set(to, { entry, fingerprint: fingerprint(final) });
            if (!existing.has(hash)) {
              try {
                await this.objects.put(
                  `${this.data(owner, id)}blobs/${hash}`,
                  Bun.file(copy),
                  null,
                );
              } catch (error) {
                if (!(error instanceof StateConflict)) throw error;
              }
              existing.add(hash);
            }
            await rm(copy);
          }
        }
      };
      await walk(source, "");
      if (
        old &&
        JSON.stringify(old.files) === JSON.stringify(files) &&
        JSON.stringify(old.directories) === JSON.stringify(directories)
      ) {
        if ((await this.head(owner, id))?.etag !== expected?.etag) throw new StateConflict();
        this.verifiedFiles.set(key, verified);
        return;
      }
      if (importOnly && expected)
        throw new Error(
          "Existing Studio state differs from the local import; no head was overwritten",
        );
      const revision = randomUUID();
      const metadata = JSON.parse(await readFile(join(source, ".sneepcut-project.json"), "utf8"));
      if (
        metadata.id !== id ||
        typeof metadata.title !== "string" ||
        (metadata.head !== undefined && !isUUID(metadata.head))
      )
        throw new Error("Invalid Studio project metadata");
      const manifest: Manifest = {
        version: 1,
        previous: expected?.revision ?? null,
        files,
        directories,
      };
      await this.objects.put(
        `${this.data(owner, id)}revisions/${revision}.json`,
        JSON.stringify(manifest),
        null,
      );
      await this.available(owner);
      const etag = await this.objects.put(
        this.headKey(owner, id),
        JSON.stringify({ version: 1, revision, title: metadata.title, generation: metadata.head }),
        expected?.etag ?? null,
      );
      await this.available(owner);
      this.known.set(key, { revision, etag, title: metadata.title, generation: metadata.head });
      this.verifiedFiles.set(key, verified);
    } catch (error) {
      this.invalid.add(key);
      throw error;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  override version(owner: string, id: string) {
    return this.known.get(`${owner}/${id}`)?.etag ?? null;
  }
  override checkpoint(owner: string, id: string) {
    const generation = this.cacheGenerations.get(`${owner}/${id}`);
    return () => {
      if (generation !== this.cacheGenerations.get(`${owner}/${id}`)) throw new StateConflict();
      return this.save(owner, id);
    };
  }
  override save(owner: string, id: string, expected?: string | null) {
    return this.locked(owner, id, () => {
      if (expected !== undefined && expected !== this.version(owner, id)) {
        this.invalid.add(`${owner}/${id}`);
        throw new StateConflict();
      }
      return this.flush(owner, id);
    });
  }
  override discard(owner: string, id: string) {
    this.invalid.add(`${owner}/${id}`);
  }
  override ensure(
    owner: string,
    id: string,
    title: string,
    initialize: (project: StoredProject) => Promise<void>,
  ) {
    return this.locked(owner, id, async () => {
      const existing = await this.resolve(owner, id);
      if (existing) return existing;
      this.localOnly.add(`${owner}/${id}`);
      let project: StoredProject;
      try {
        project = await super.ensure(owner, id, title, initialize);
      } finally {
        this.localOnly.delete(`${owner}/${id}`);
      }
      await this.flush(owner, id);
      return project;
    });
  }
  override publish(
    owner: string,
    id: string,
    title: string,
    initialize: (project: StoredProject) => Promise<void>,
  ) {
    return this.locked(owner, id, async () => {
      if (!this.known.has(`${owner}/${id}`)) await this.resolve(owner, id);
      this.localOnly.add(`${owner}/${id}`);
      let project: StoredProject;
      try {
        project = await super.publish(owner, id, title, initialize);
      } finally {
        this.localOnly.delete(`${owner}/${id}`);
      }
      await this.flush(owner, id);
      return project;
    });
  }
  override async remove(owner: string, id: string) {
    await this.locked(owner, id, async () => {
      const head = await this.head(owner, id);
      await this.objects.put(
        this.headKey(owner, id),
        JSON.stringify({ version: 1, revision: null }),
        head?.etag ?? null,
      );
      await super.remove(owner, id);
      this.known.delete(`${owner}/${id}`);
      for (const key of await this.objects.list(this.data(owner, id)))
        await this.objects.delete(key);
    });
  }
  override async removeOwner(owner: string) {
    await this.disableOwner(owner);
    await super.removeOwner(owner);
    for (const key of await this.objects.list(this.ownerPrefix(owner)))
      await this.objects.delete(key);
  }
  /** Explicit import retains originals and refuses to overwrite a different remote revision. */
  async importLocal(owner: string, id: string, source: string) {
    await this.locked(owner, id, async () => {
      await this.available(owner);
      const head = await this.head(owner, id);
      if (head && !head.revision) throw new Error("Refusing to import a deleted Studio project");
      const parent = await super.userHome(owner);
      const destination = join(parent, id);
      if (source === destination)
        throw new Error("Studio import source must be outside the disposable cache");
      await rm(destination, { recursive: true, force: true });
      await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
      this.known.set(`${owner}/${id}`, head);
      await this.flush(owner, id, true);
      this.invalid.add(`${owner}/${id}`);
      await this.resolve(owner, id); // Download and verify every imported byte before reporting success.
    });
  }
}
function isMissing(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
