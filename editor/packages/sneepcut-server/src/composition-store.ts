import { cp, lstat, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { ProjectStore, type StoredProject } from "./store";
import { withWorkspace, workspaceFileIncluded } from "./workspace";

export interface CompositionReceipt {
  artifact_id: string;
  scope_id?: string;
  project_id?: string;
  base_artifact_id?: string;
  baseline_artifact_id?: string;
  base_revision?: string;
  committed_revision?: string;
  publishing_revision?: string;
  workspace_absent?: boolean;
  export_only?: boolean;
  manually_edited?: boolean;
  effective_timeline?: {
    width: number;
    height: number;
    duration: number;
    manually_edited: boolean;
    scenes: Array<{
      id: string;
      canonical_scene_id: string;
      asset_id: string;
      start: number;
      duration: number;
      source_in: number;
      playback_rate: number;
    }>;
  };
  hash: string;
  status: "preparing" | "rendering" | "complete" | "failed" | "cancelled";
  progress: number;
  duration: number;
  width: number;
  height: number;
  size?: number;
  preview_available: boolean;
  error?: string;
}

/** Generated projects have no browser-facing project API and are never edited in place. */
export class CompositionStore {
  readonly snapshots: ProjectStore;
  readonly baselines: ProjectStore;
  readonly sources: ProjectStore;
  readonly generated: ProjectStore;
  readonly staged: ProjectStore;
  readonly workspaces: ProjectStore;
  private readonly receipts: ProjectStore;
  private readonly deletedArtifacts: ProjectStore;
  private readonly deletedScopes: ProjectStore;
  private readonly imports: ProjectStore;
  private readonly workspaceHeads: ProjectStore;
  private readonly pending = new Map<string, Promise<void>>();
  private readonly ownerLocks = new Map<string, Promise<void>>();
  constructor(root: string) {
    this.snapshots = new ProjectStore(join(root, "snapshots"));
    this.baselines = new ProjectStore(join(root, "baselines"));
    this.sources = new ProjectStore(join(root, "sources"));
    this.generated = new ProjectStore(join(root, "generated"));
    this.staged = new ProjectStore(join(root, "staged"));
    this.workspaces = new ProjectStore(join(root, "workspaces"));
    this.receipts = new ProjectStore(join(root, "receipts"));
    this.deletedArtifacts = new ProjectStore(join(root, "deleted-artifacts"));
    this.deletedScopes = new ProjectStore(join(root, "deleted-scopes"));
    this.imports = new ProjectStore(join(root, "imports"));
    this.workspaceHeads = new ProjectStore(join(root, "workspace-heads"));
  }
  /** Serialize publication and deletion, including the editable copy's final rename. */
  async withOwner<T>(owner: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.ownerLocks.get(owner) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.ownerLocks.set(owner, gate);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.ownerLocks.get(owner) === gate) this.ownerLocks.delete(owner);
    }
  }
  async assertAvailable(owner: string, id?: string, scope?: string): Promise<void> {
    if (
      (await this.deletedArtifacts.ownerDisabled(owner)) ||
      (id && (await this.deletedArtifacts.resolve(owner, id))) ||
      (scope && (await this.deletedScopes.resolve(owner, scope)))
    ) {
      throw new HTTPException(404, { message: "The Studio composition has been deleted." });
    }
  }
  async ownerDeleted(owner: string): Promise<boolean> {
    return this.deletedArtifacts.ownerDisabled(owner);
  }
  async tombstone(owner: string, ids: string[], scope?: string): Promise<void> {
    if (scope)
      await this.deletedScopes.ensure(owner, scope, "Deleted composition scope", async () => {});
    for (const id of ids)
      await this.deletedArtifacts.ensure(owner, id, "Deleted composition", async () => {});
  }
  async tombstoneOwner(owner: string): Promise<void> {
    await this.deletedArtifacts.disableOwner(owner);
  }
  async scopeArtifacts(owner: string, scope: string): Promise<string[]> {
    const result: string[] = [];
    for (const project of await this.receipts.list(owner)) {
      if ((await this.read(owner, project.id))?.scope_id === scope) result.push(project.id);
    }
    return result;
  }
  async removeArtifacts(owner: string, ids: string[], editable?: ProjectStore): Promise<void> {
    const removed = new Set(ids);
    for (const project of await this.imports.list(owner)) {
      const reference: unknown = JSON.parse(
        await readFile(join(project.dir, "origin.json"), "utf8"),
      );
      if (
        reference &&
        typeof reference === "object" &&
        "artifact_id" in reference &&
        typeof reference.artifact_id === "string" &&
        removed.has(reference.artifact_id)
      ) {
        const workspace =
          "project_id" in reference && typeof reference.project_id === "string"
            ? reference.project_id
            : project.id;
        const head = await this.workspaceHeads.resolve(owner, workspace);
        const current: unknown = head
          ? JSON.parse(await readFile(join(head.dir, "origin.json"), "utf8"))
          : undefined;
        if (
          !current ||
          (typeof current === "object" &&
            "artifact_id" in current &&
            typeof current.artifact_id === "string" &&
            removed.has(current.artifact_id))
        ) {
          await editable?.remove(owner, workspace);
          await this.workspaceHeads.remove(owner, workspace);
        }
        await this.imports.remove(owner, project.id);
      }
    }
    for (const id of ids) {
      await this.snapshots.remove(owner, id);
      await this.baselines.remove(owner, id);
      await this.sources.remove(owner, id);
      await this.generated.remove(owner, id);
      await this.staged.remove(owner, id);
      await this.receipts.remove(owner, id);
    }
  }
  async removeOwner(owner: string, editable?: ProjectStore): Promise<void> {
    await this.tombstoneOwner(owner);
    await editable?.removeOwner(owner);
    await this.snapshots.removeOwner(owner);
    await this.receipts.removeOwner(owner);
    await this.imports.removeOwner(owner);
    await this.baselines.removeOwner(owner);
    await this.sources.removeOwner(owner);
    await this.generated.removeOwner(owner);
    await this.staged.removeOwner(owner);
    await this.workspaces.removeOwner(owner);
    await this.workspaceHeads.removeOwner(owner);
  }
  async workspaceID(owner: string, artifact: string, preferred?: string): Promise<string> {
    const receipt = await this.read(owner, artifact);
    if (!receipt)
      throw new HTTPException(404, { message: "The original composition is unavailable" });
    if (receipt.project_id) {
      if (preferred && preferred !== receipt.project_id)
        throw new HTTPException(409, {
          message: "Composition belongs to a different editable workspace",
        });
      return receipt.project_id;
    }
    const candidates: string[] = [];
    for (const project of await this.imports.list(owner)) {
      const value: unknown = JSON.parse(await readFile(join(project.dir, "origin.json"), "utf8"));
      if (
        value &&
        typeof value === "object" &&
        "artifact_id" in value &&
        value.artifact_id === artifact
      )
        candidates.push(
          "project_id" in value && typeof value.project_id === "string"
            ? value.project_id
            : project.id,
        );
    }
    if (candidates.length > 1 && (!preferred || !candidates.includes(preferred)))
      throw new HTTPException(409, {
        message: "Multiple editable copies exist; select the intended Studio workspace",
      });
    receipt.project_id =
      (preferred && candidates.includes(preferred) ? preferred : candidates[0]) ??
      preferred ??
      artifact;
    await this.write(owner, receipt);
    return receipt.project_id;
  }
  async registerWorkspace(
    owner: string,
    artifact: string,
    projectId: string,
    title: string,
    accepted = false,
  ): Promise<void> {
    // Every artifact gets a record, so deleting any accepted lineage can locate the shared workspace.
    await this.imports.ensure(owner, artifact, title, async (project) => {
      await writeFile(
        join(project.dir, "origin.json"),
        JSON.stringify({ artifact_id: artifact, project_id: projectId }),
        { flag: "wx" },
      );
    });
    const head = await this.workspaceHeads.ensure(owner, projectId, title, async (project) => {
      await writeFile(join(project.dir, "origin.json"), JSON.stringify({ artifact_id: artifact }), {
        flag: "wx",
      });
    });
    if (accepted) {
      const temporary = join(head.dir, `${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify({ artifact_id: artifact }), { flag: "wx" });
      await rename(temporary, join(head.dir, "origin.json"));
    }
  }
  async workspaceHead(owner: string, projectID: string): Promise<string | undefined> {
    const head = await this.workspaceHeads.resolve(owner, projectID);
    if (!head) return;
    const value: unknown = JSON.parse(await readFile(join(head.dir, "origin.json"), "utf8"));
    if (
      value &&
      typeof value === "object" &&
      "artifact_id" in value &&
      typeof value.artifact_id === "string"
    )
      return value.artifact_id;
  }
  /** Finish an accepted publication interrupted between the atomic head and its receipt. */
  async recoverWorkspacePublication(
    owner: string,
    projectID: string,
    revision: string,
  ): Promise<string | undefined> {
    const candidates: CompositionReceipt[] = [];
    for (const entry of await this.receipts.list(owner)) {
      const saved = await this.read(owner, entry.id);
      if (
        saved?.project_id === projectID &&
        saved.status === "complete" &&
        !saved.export_only &&
        saved.publishing_revision === revision &&
        !saved.committed_revision
      )
        candidates.push(saved);
    }
    if (candidates.length > 1)
      throw new HTTPException(409, {
        message:
          "Studio has conflicting interrupted publications; retry the accepted operation first",
      });
    const saved = candidates[0];
    if (!saved) return;
    await this.assertAvailable(owner, saved.artifact_id, saved.scope_id);
    const project = await this.completed(owner, saved.artifact_id);
    await this.registerWorkspace(owner, saved.artifact_id, projectID, project.title, true);
    saved.committed_revision = revision;
    delete saved.publishing_revision;
    await this.write(owner, saved);
    return saved.artifact_id;
  }
  async importProject(
    owner: string,
    artifact: string,
    editable: ProjectStore,
    projectId: string,
    title: string,
  ): Promise<StoredProject> {
    return this.withOwner(owner, async () => {
      await this.completed(owner, artifact);
      const receipt = await this.read(owner, artifact);
      const workspace = await this.workspaceID(
        owner,
        artifact,
        receipt?.project_id ? undefined : projectId,
      );
      return withWorkspace(owner, workspace, async () => {
        if (receipt?.export_only) {
          const current = await editable.resolve(owner, workspace);
          if (!current)
            throw new HTTPException(409, {
              message: "The primary Studio project has not been accepted yet",
            });
          return current;
        }
        // This trusted mapping lives outside the editable project and cannot be changed through Studio.
        await this.registerWorkspace(owner, artifact, workspace, title);
        return editable.ensure(owner, workspace, title, (project) =>
          this.copyTo(owner, artifact, project.dir),
        );
      });
    });
  }
  private async withReceipt<T>(owner: string, id: string, operation: () => Promise<T>): Promise<T> {
    const key = `${owner}/${id}`;
    const previous = this.pending.get(key) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.pending.set(key, gate);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.pending.get(key) === gate) this.pending.delete(key);
    }
  }
  async reserve(owner: string, receipt: CompositionReceipt): Promise<CompositionReceipt> {
    await this.receipts.ensure(
      owner,
      receipt.artifact_id,
      "Composition render receipt",
      async (project) => {
        await writeFile(join(project.dir, "receipt.json"), JSON.stringify(receipt), { flag: "wx" });
      },
    );
    const existing = await this.read(owner, receipt.artifact_id);
    if (!existing || existing.hash !== receipt.hash)
      throw new HTTPException(409, {
        message: "This composition identifier already belongs to a different plan.",
      });
    return existing;
  }
  async read(owner: string, id: string): Promise<CompositionReceipt | null> {
    return this.withReceipt(owner, id, async () => {
      const project = await this.receipts.resolve(owner, id);
      if (!project) return null;
      const value: unknown = JSON.parse(await readFile(join(project.dir, "receipt.json"), "utf8"));
      if (
        !value ||
        typeof value !== "object" ||
        !("artifact_id" in value) ||
        value.artifact_id !== id ||
        !("hash" in value) ||
        typeof value.hash !== "string" ||
        !("status" in value) ||
        !["preparing", "rendering", "complete", "failed", "cancelled"].includes(
          String(value.status),
        ) ||
        !("progress" in value) ||
        typeof value.progress !== "number" ||
        !("duration" in value) ||
        typeof value.duration !== "number" ||
        !("width" in value) ||
        typeof value.width !== "number" ||
        !("height" in value) ||
        typeof value.height !== "number" ||
        !("preview_available" in value) ||
        typeof value.preview_available !== "boolean"
      ) {
        throw new Error("Invalid composition receipt");
      }
      // Only this service writes receipts; narrow each field before returning persisted data.
      const status = value.status;
      if (
        status !== "preparing" &&
        status !== "rendering" &&
        status !== "complete" &&
        status !== "failed" &&
        status !== "cancelled"
      )
        throw new Error("Invalid composition status");
      return {
        artifact_id: id,
        ...("scope_id" in value && typeof value.scope_id === "string"
          ? { scope_id: value.scope_id }
          : {}),
        ...optionalReceiptFields(value),
        hash: value.hash,
        status,
        progress: value.progress,
        duration: value.duration,
        width: value.width,
        height: value.height,
        preview_available: value.preview_available,
        ...("size" in value && typeof value.size === "number" ? { size: value.size } : {}),
        ...("error" in value && typeof value.error === "string" ? { error: value.error } : {}),
      };
    });
  }
  async write(owner: string, receipt: CompositionReceipt): Promise<void> {
    return this.withReceipt(owner, receipt.artifact_id, async () => {
      const project = await this.receipts.resolve(owner, receipt.artifact_id);
      if (!project) throw new Error("Composition receipt unavailable");
      const temporary = join(project.dir, `receipt-${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
      await rename(temporary, join(project.dir, "receipt.json"));
    });
  }
  async completed(owner: string, id: string): Promise<StoredProject> {
    const receipt = await this.read(owner, id);
    await this.assertAvailable(owner, id, receipt?.scope_id);
    const project = await this.snapshots.resolve(owner, id);
    if (!project || receipt?.status !== "complete")
      throw new HTTPException(404, { message: "The original Studio composition is unavailable." });
    return project;
  }
  async copyTo(owner: string, id: string, destination: string): Promise<void> {
    const project = await this.completed(owner, id);
    await copyCompositionFiles(project.dir, destination);
  }
}

/** Copy bytes, never reconstruct HTML; reject links before traversing the snapshot. */
export async function copyCompositionFiles(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source)) {
    if (!workspaceFileIncluded(entry)) continue;
    await cp(join(source, entry), join(destination, entry), {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: async (path) => {
        if (path !== source && !workspaceFileIncluded(basename(path))) return false;
        const info = await lstat(path);
        if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
          throw new Error("Unsupported composition file");
        return true;
      },
    });
  }
}

function optionalReceiptFields(value: object): Partial<CompositionReceipt> {
  const result: Partial<CompositionReceipt> = {};
  for (const key of [
    "project_id",
    "base_artifact_id",
    "baseline_artifact_id",
    "base_revision",
    "committed_revision",
    "publishing_revision",
  ] as const) {
    if (key in value && typeof Reflect.get(value, key) === "string")
      result[key] = Reflect.get(value, key);
  }
  for (const key of ["workspace_absent", "export_only", "manually_edited"] as const) {
    if (key in value && typeof Reflect.get(value, key) === "boolean")
      result[key] = Reflect.get(value, key);
  }
  if (
    "effective_timeline" in value &&
    value.effective_timeline &&
    typeof value.effective_timeline === "object"
  ) {
    // Persisted only by the trusted merge reader; the API never accepts this field.
    const timeline = value.effective_timeline;
    if (
      "width" in timeline &&
      typeof timeline.width === "number" &&
      "height" in timeline &&
      typeof timeline.height === "number" &&
      "duration" in timeline &&
      typeof timeline.duration === "number" &&
      "manually_edited" in timeline &&
      typeof timeline.manually_edited === "boolean" &&
      "scenes" in timeline &&
      Array.isArray(timeline.scenes)
    )
      result.effective_timeline = {
        width: timeline.width,
        height: timeline.height,
        duration: timeline.duration,
        manually_edited: timeline.manually_edited,
        scenes: timeline.scenes,
      };
  }
  return result;
}
