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
    return this.directory(join(this.root, userId), create);
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
      const temporary = await mkdtemp(join(parent, ".prepare-"));
      const project = { id: projectId, title: title.slice(0, 160), dir: temporary };
      try {
        await initialize(project);
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
  async create(userId: string, title: string): Promise<StoredProject> {
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 160)
      throw new Error("Title must contain 1–160 characters");
    const parent = await this.userDirectory(userId);
    const project = { id: randomUUID(), title: cleanTitle, dir: "" };
    project.dir = join(parent, project.id);
    await mkdir(project.dir, { mode: 0o700 });
    await writeFile(
      join(project.dir, ".sneepcut-project.json"),
      JSON.stringify({ id: project.id, title: project.title }),
      { flag: "wx", mode: 0o600 },
    );
    return project;
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
      return { id: projectId, dir, title: metadata.title };
    } catch {
      return null;
    }
  }
}
