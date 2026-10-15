import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  lstat,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

export interface StoredProject {
  id: string;
  dir: string;
  title: string;
}
export const isUUID = (value: string): boolean =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function validId(value: string): void {
  if (!isUUID(value)) throw new Error("Invalid identifier");
}

/** Each directory is checked independently: symlinks are never project boundaries. */
export class ProjectStore {
  readonly root: string;
  private readonly pending = new Map<string, Promise<StoredProject>>();
  constructor(root: string) {
    this.root = resolve(root);
  }
  private async directory(path: string, create: boolean): Promise<string> {
    if (create) await mkdir(path, { recursive: true, mode: 0o700 });
    if (
      (await lstat(path)).isSymbolicLink() ||
      resolve(await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()
    ) {
      throw new Error("Unsafe project directory");
    }
    return path;
  }
  private async userDirectory(userId: string, create = true): Promise<string> {
    validId(userId);
    await this.directory(this.root, create);
    if (await this.ownerDisabled(userId)) throw new Error("Project owner has been deleted");
    return this.directory(join(this.root, userId), create);
  }
  async ownerDisabled(userId: string): Promise<boolean> {
    validId(userId);
    try {
      await lstat(join(this.root, ".deleted-owners", userId));
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        return false;
      throw error;
    }
  }
  /** A durable fence prevents pending or later requests from recreating purged accounts. */
  async disableOwner(userId: string): Promise<void> {
    validId(userId);
    await this.directory(this.root, true);
    const markers = await this.directory(join(this.root, ".deleted-owners"), true);
    await writeFile(join(markers, userId), "deleted\n", { flag: "a", mode: 0o600 });
  }
  async removeOwner(userId: string): Promise<void> {
    await this.disableOwner(userId);
    await Promise.allSettled(
      [...this.pending]
        .filter(([key]) => key.startsWith(`${userId}/`))
        .map(([, operation]) => operation),
    );
    try {
      const directory = await this.directory(join(this.root, userId), false);
      await rm(directory, { recursive: true, force: true });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
        throw error;
    }
  }
  async remove(userId: string, projectId: string): Promise<void> {
    validId(userId);
    validId(projectId);
    await this.pending.get(`${userId}/${projectId}`)?.catch(() => {});
    try {
      const parent = await this.userDirectory(userId, false);
      for (const name of await readdir(parent)) {
        if (name !== projectId && !name.startsWith(`.prepare-${projectId}-`)) continue;
        const directory = await this.directory(join(parent, name), false);
        await rm(directory, { recursive: true, force: true });
      }
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
        throw error;
    }
  }
  async userHome(userId: string): Promise<string> {
    return this.userDirectory(userId);
  }
  /** Publish only complete projects; repeated opens reuse the user's editable copy. */
  async ensure(
    userId: string,
    projectId: string,
    title: string,
    initialize: (project: StoredProject) => Promise<void>,
  ): Promise<StoredProject> {
    validId(userId);
    validId(projectId);
    const key = `${userId}/${projectId}`;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const operation = (async () => {
      const existing = await this.resolve(userId, projectId);
      if (existing) return existing;
      const parent = await this.userDirectory(userId);
      const temporary = await mkdtemp(join(parent, `.prepare-${projectId}-`));
      const project = { id: projectId, title: title.slice(0, 160), dir: temporary };
      try {
        await initialize(project);
        if (await this.ownerDisabled(userId)) throw new Error("Project owner has been deleted");
        await writeFile(
          join(temporary, ".sneepcut-project.json"),
          JSON.stringify({
            id: projectId,
            title: project.title,
          }),
          { flag: "wx", mode: 0o600 },
        );
        const destination = join(parent, projectId);
        await rename(temporary, destination);
        return { ...project, dir: destination };
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    })();
    this.pending.set(key, operation);
    try {
      return await operation;
    } finally {
      this.pending.delete(key);
    }
  }
  async list(userId: string): Promise<StoredProject[]> {
    const dir = await this.userDirectory(userId);
    const result: StoredProject[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isUUID(entry.name)) continue;
      const project = await this.resolve(userId, entry.name);
      if (project) result.push(project);
    }
    return result;
  }
  /** Publish a complete generation by atomically replacing one private head pointer. */
  async publish(
    userId: string,
    projectId: string,
    title: string,
    initialize: (project: StoredProject) => Promise<void>,
  ): Promise<StoredProject> {
    validId(projectId);
    const existing = await this.resolve(userId, projectId);
    const parent = await this.userDirectory(userId);
    if (!existing) {
      const temporary = await mkdtemp(join(parent, `.prepare-${projectId}-`));
      const generation = randomUUID();
      const leaf = join(temporary, ".revisions", generation);
      const project = { id: projectId, title: title.slice(0, 160), dir: leaf };
      try {
        await mkdir(leaf, { recursive: true });
        await initialize(project);
        if (await this.ownerDisabled(userId)) throw new Error("Project owner has been deleted");
        await writeFile(
          join(temporary, ".sneepcut-project.json"),
          JSON.stringify({ id: projectId, title: project.title, head: generation }),
          { flag: "wx", mode: 0o600 },
        );
        await rename(temporary, join(parent, projectId));
        return { ...project, dir: join(parent, projectId, ".revisions", generation) };
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
    const container = await this.directory(join(parent, projectId), false);
    const generations = await this.directory(join(container, ".revisions"), true);
    const generation = randomUUID();
    const temporary = await mkdtemp(join(parent, `.prepare-${projectId}-`));
    const project = { id: projectId, title: title.slice(0, 160), dir: temporary };
    try {
      await initialize(project);
      if (await this.ownerDisabled(userId)) throw new Error("Project owner has been deleted");
      const destination = join(generations, generation);
      await rename(temporary, destination);
      const metadata = join(container, `.head-${generation}.tmp`);
      await writeFile(
        metadata,
        JSON.stringify({ id: projectId, title: project.title, head: generation }),
        { flag: "wx", mode: 0o600 },
      );
      await rename(metadata, join(container, ".sneepcut-project.json"));
      return { ...project, dir: destination };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  async create(
    userId: string,
    title: string,
    initialize: (project: StoredProject) => Promise<void> = async () => {},
  ): Promise<StoredProject> {
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 160)
      throw new Error("Title must contain 1–160 characters");
    return this.ensure(userId, randomUUID(), cleanTitle, initialize);
  }
  async resolve(userId: string, projectId: string): Promise<StoredProject | null> {
    validId(userId);
    if (!isUUID(projectId)) return null;
    try {
      const parent = await this.userDirectory(userId, false);
      const dir = await this.directory(join(parent, projectId), false);
      const metadataPath = join(dir, ".sneepcut-project.json");
      if ((await lstat(metadataPath)).isSymbolicLink()) return null;
      const metadata: unknown = JSON.parse(await readFile(metadataPath, "utf8"));
      if (
        !metadata ||
        typeof metadata !== "object" ||
        !("title" in metadata) ||
        typeof metadata.title !== "string"
      )
        return null;
      if ("head" in metadata) {
        if (typeof metadata.head !== "string" || !isUUID(metadata.head)) return null;
        const revisions = await this.directory(join(dir, ".revisions"), false);
        const current = await this.directory(join(revisions, metadata.head), false);
        return { id: projectId, dir: current, title: metadata.title };
      }
      return { id: projectId, dir, title: metadata.title };
    } catch {
      return null;
    }
  }
}
