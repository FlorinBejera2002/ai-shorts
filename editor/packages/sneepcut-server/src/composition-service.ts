import { createHash } from "node:crypto";
import { mkdir, lstat, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { HTTPException } from "hono/http-exception";
import type { AuthFetcher } from "./auth";
import { bundledGsap } from "./assets";
import { verifyCompositionGrant } from "./composition-auth";
import { COMPOSITION_REQUEST_MAX_BYTES, compositionMaxBytes } from "./composition-limits";
import {
  CompositionStore,
  copyCompositionFiles,
  type CompositionReceipt,
} from "./composition-store";
import {
  compileCanonicalComposition,
  parseCanonicalComposition,
  type CanonicalCompositionPlan,
  type CanonicalAssetPath,
} from "./canonical-composition";
import { downloadImportFile, mediaDownloadURL } from "./import-media";
import { startSandboxRender } from "./sandbox";
import { isUUID, type StoredProject, type ProjectStore } from "./store";
import {
  mergeCompositionProject,
  readEffectiveComposition,
  removePlatformBadge,
} from "./canonical-merge";
import {
  EMPTY_WORKSPACE_REVISION,
  withWorkspace,
  workspaceFileIncluded,
  workspaceRevision,
} from "./workspace";
import { stableProjectId } from "./clip-import";

interface ServiceOptions {
  store: CompositionStore;
  secret?: string;
  mediaOrigin: string;
  mediaFetchOrigin?: string;
  mediaS3Origin?: string;
  editableStore?: ProjectStore;
  closeOwner?: (owner: string) => Promise<void | (() => void)>;
  workspaceCommitted?: (owner: string, projectID: string) => Promise<void>;
  fetcher?: AuthFetcher;
  render?: typeof startSandboxRender;
  now?: () => number;
  maxBytes?: number;
  pollMilliseconds?: number;
}
interface ActiveJob {
  receipt: CompositionReceipt;
  controller: AbortController;
  render?: ReturnType<typeof startSandboxRender>;
  done?: Promise<void>;
}
type Derivation = {
  start: number;
  end: number;
  title?: string;
  remove_platform_badge?: boolean;
  expected_duration?: number;
};
type CompositionInput = {
  scope_id?: string;
  project_id?: string;
  base_artifact_id?: string;
  export_only?: boolean;
  source_clip_id?: string;
  legacy_story_version?: number;
} & ({ plan: CanonicalCompositionPlan } | { derive: Derivation });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function identifier(value: unknown): string {
  if (typeof value !== "string" || !isUUID(value))
    throw new HTTPException(422, { message: "Invalid composition identifier" });
  return value;
}
function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new HTTPException(422, { message: "Unsupported composition fields" });
}
const outputName = (preview: boolean) => (preview ? "preview.mp4" : "video.mp4");
const publicReceipt = ({ hash: _hash, ...receipt }: CompositionReceipt) => receipt;
class LegacyWorkspaceConflict extends HTTPException {
  constructor() {
    super(409, {
      message:
        "This older clip already has a saved Studio project. Continue editing it in Studio to preserve those edits.",
    });
  }
}

/** A trim seeks the exact original document, including all nested animation and audio. */
export function derivedCompositionHTML(
  base: { width: number; height: number; duration: number },
  start: number,
  end: number,
  sourceFile = "original-composition.html",
): string {
  const duration = end - start;
  if (!/^[a-zA-Z0-9_-]+\.html$/.test(sourceFile))
    throw new Error("Invalid original composition filename");
  const windowID = `window-${sourceFile.slice(0, -5)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><script src="vendor/gsap.min.js"></script><style>body{margin:0;background:#000}#main{position:relative;width:${base.width}px;height:${base.height}px;overflow:hidden}.clip{position:absolute;inset:0}</style></head><body><div id="main" data-composition-id="main" data-width="${base.width}" data-height="${base.height}" data-duration="${duration}"><div id="${windowID}" class="clip" data-source-window data-composition-id="${windowID}" data-composition-src="${sourceFile}" data-start="0" data-duration="${duration}" data-playback-start="${start}" data-source-duration="${base.duration}" data-width="${base.width}" data-height="${base.height}" data-track-index="0"></div></div><script>window.__timelines["main"]=gsap.timeline({paused:true}).to({}, {duration:${duration}});</script></body></html>`;
}

/** Signature query strings expire; the immutable media identity is its trusted path. */
function contentHash(input: CompositionInput, mediaOrigin: string): string {
  const value =
    "plan" in input
      ? {
          ...input,
          plan: {
            ...input.plan,
            assets: input.plan.assets.map((asset) => ({
              ...asset,
              url: `${new URL(asset.url, mediaOrigin).origin}${new URL(asset.url, mediaOrigin).pathname}`,
              ...(asset.preview_url
                ? {
                    preview_url: `${new URL(asset.preview_url, mediaOrigin).origin}${new URL(asset.preview_url, mediaOrigin).pathname}`,
                  }
                : {}),
            })),
          },
        }
      : input;
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function projectSize(directory: string, maximum: number): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!workspaceFileIncluded(entry.name)) continue;
    const path = join(directory, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
      throw new Error("Unsupported composition file");
    total += info.isDirectory() ? await projectSize(path, maximum - total) : info.size;
    if (total > maximum)
      throw new Error("Composition sources exceed the configured aggregate byte budget");
  }
  return total;
}

async function outputSize(project: StoredProject, preview: boolean): Promise<number> {
  const info = await lstat(join(project.dir, "renders", outputName(preview)));
  if (info.isSymbolicLink() || !info.isFile() || !info.size || info.size > 1024 ** 3)
    throw new Error("Composition output is invalid");
  return info.size;
}

async function compositionTextFiles(directory: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  async function walk(dir: string, prefix: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!workspaceFileIncluded(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error("Unsupported composition file");
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await walk(join(dir, entry.name), `${name}/`);
      else if (/\.(html|json)$/i.test(entry.name))
        files.set(name, await readFile(join(dir, entry.name), "utf8"));
    }
  }
  await walk(directory, "");
  return files;
}

/** Internal, owner-bound API for producing the same editable documents Studio renders. */
export function createCompositionService(options: ServiceOptions) {
  const editable = options.editableStore ?? options.store.workspaces;
  const active = new Map<string, ActiveJob>();
  const locks = new Map<string, Promise<void>>();
  const maxBytes = options.maxBytes ?? compositionMaxBytes();
  const origin = new URL(options.mediaOrigin);
  if (!["http:", "https:"].includes(origin.protocol))
    throw new Error("Invalid composition media origin");
  if (options.mediaFetchOrigin) {
    const internal = new URL(options.mediaFetchOrigin);
    if (
      !["http:", "https:"].includes(internal.protocol) ||
      internal.username ||
      internal.password ||
      internal.pathname !== "/" ||
      internal.search ||
      internal.hash
    )
      throw new Error("Invalid internal composition media origin");
  }
  const s3 = options.mediaS3Origin ? new URL(options.mediaS3Origin) : undefined;
  if (
    s3 &&
    (!["http:", "https:"].includes(s3.protocol) ||
      s3.username ||
      s3.password ||
      s3.pathname !== "/" ||
      s3.search ||
      s3.hash)
  )
    throw new Error("Invalid S3 composition media origin");
  function mediaURL(reference: string): URL {
    const source = new URL(reference, options.mediaOrigin);
    if (s3 && source.origin === s3.origin && !source.username && !source.password && !source.hash)
      return source;
    return mediaDownloadURL(reference, options.mediaOrigin, options.mediaFetchOrigin);
  }
  async function locked<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(key, gate);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (locks.get(key) === gate) locks.delete(key);
    }
  }
  async function receipt(owner: string, id: string): Promise<CompositionReceipt> {
    await options.store.assertAvailable(owner, id);
    const current = active.get(`${owner}/${id}`);
    if (current) {
      // Do not advertise a terminal result until its receipt has been flushed.
      if (!["preparing", "rendering"].includes(current.receipt.status))
        return (await options.store.read(owner, id)) ?? current.receipt;
      return {
        ...current.receipt,
        ...(current.render ? { progress: Math.min(99, current.render.progress) } : {}),
      };
    }
    const saved = await options.store.read(owner, id);
    if (!saved) throw new HTTPException(404, { message: "Composition was not found" });
    if (saved.status === "preparing" || saved.status === "rendering") {
      saved.status = "failed";
      saved.error =
        "The Studio service restarted before rendering completed. Retry this composition.";
      await options.store.write(owner, saved);
    }
    return saved;
  }
  async function vendor(directory: string) {
    const gsap = bundledGsap("gsap.min.js");
    if (!gsap) throw new Error("Bundled composition animation library unavailable");
    await mkdir(join(directory, "vendor"), { recursive: true });
    await writeFile(join(directory, "vendor/gsap.min.js"), gsap);
    await writeFile(join(directory, ".canonical-composition"), "1\n");
  }
  async function preparePlan(
    project: StoredProject,
    plan: CanonicalCompositionPlan,
    signal: AbortSignal,
  ) {
    const paths = new Map<string, CanonicalAssetPath>();
    await mkdir(join(project.dir, "assets"), { recursive: true });
    let remaining = maxBytes - 16 * 1024 ** 2;
    const fetcher: AuthFetcher = (input, init) =>
      (options.fetcher ?? fetch)(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
      });
    const download = async (url: URL, path: string) => {
      try {
        return await downloadImportFile(fetcher, url, join(project.dir, path), remaining);
      } catch (error) {
        if (error instanceof HTTPException && error.status === 413)
          throw new Error(
            `Composition sources exceed the configured aggregate byte budget (${Math.floor(maxBytes / 1024 ** 2)} MiB)`,
          );
        throw error;
      }
    };
    for (const asset of plan.assets) {
      signal.throwIfAborted();
      const url = mediaURL(asset.url);
      const candidate = extname(url.pathname).toLowerCase();
      const extension =
        /^\.(mp4|mov|webm|m4v|mp3|wav|m4a|aac|ogg|png|jpe?g|webp|ttf|otf|woff2?)$/.test(candidate)
          ? candidate
          : { video: ".mp4", audio: ".wav", image: ".png", font: ".ttf" }[asset.kind];
      const identity = new URL(asset.url, options.mediaOrigin);
      const name = createHash("sha256")
        .update(`${asset.id}\n${identity.origin}${identity.pathname}`)
        .digest("hex")
        .slice(0, 24);
      const path = `assets/source-${name}${extension}`;
      remaining -= await download(url, path);
      let previewPath: string | undefined;
      if (asset.preview_url) {
        const preview = new URL(asset.preview_url, options.mediaOrigin);
        const previewName = createHash("sha256")
          .update(`${asset.id}\n${preview.origin}${preview.pathname}`)
          .digest("hex")
          .slice(0, 24);
        previewPath = `assets/preview-${previewName}.mp4`;
        remaining -= await download(mediaURL(asset.preview_url), previewPath);
      }
      paths.set(asset.id, { path, ...(previewPath ? { previewPath } : {}) });
    }
    signal.throwIfAborted();
    const composition = compileCanonicalComposition(plan, paths);
    for (const [path, content] of composition.files) {
      if (
        !/^[a-zA-Z0-9_./-]+$/.test(path) ||
        path.startsWith("/") ||
        path.split("/").includes("..")
      )
        throw new Error("Invalid generated composition path");
      await mkdir(dirname(join(project.dir, path)), { recursive: true });
      await writeFile(join(project.dir, path), content);
    }
    await vendor(project.dir);
    await projectSize(project.dir, maxBytes);
  }
  async function prepareDerivation(
    project: StoredProject,
    derive: Derivation,
    source: StoredProject,
    artifactID: string,
    baselineOnly = false,
  ) {
    const base = readEffectiveComposition(await compositionTextFiles(source.dir));
    if (
      derive.expected_duration !== undefined &&
      Math.abs(base.duration - derive.expected_duration) > 0.12
    )
      throw new HTTPException(409, {
        message: "The saved Studio timeline changed; refresh the trim range and retry",
      });
    if (!baselineOnly && derive.end > base.duration + 0.002)
      throw new HTTPException(409, {
        message: "The saved Studio timeline is shorter than the requested trim",
      });
    await copyCompositionFiles(source.dir, project.dir);
    const sourceFile = `original-composition-${artifactID}.html`;
    await rename(join(project.dir, "index.html"), join(project.dir, sourceFile));
    await vendor(project.dir);
    // A source window seeks the original document, including its nested timelines,
    // audio, subtitles, branding and arbitrary layers; no recipe reconstruction.
    const html = derivedCompositionHTML(base, derive.start, derive.end, sourceFile);
    await writeFile(join(project.dir, "index.html"), html);
    await writeFile(
      join(project.dir, "render-config.json"),
      await readFile(join(source.dir, "render-config.json")),
    );
    if (derive.remove_platform_badge) await removePlatformBadge(project.dir);
    await projectSize(project.dir, maxBytes);
  }
  async function waitForRender(job: ActiveJob, project: StoredProject, preview: boolean) {
    const config: unknown = JSON.parse(
      await readFile(join(project.dir, "render-config.json"), "utf8"),
    );
    const hdrMode = preview
      ? "force-sdr"
      : record(config) && config.hdrMode === "force-hdr"
        ? "force-hdr"
        : "force-sdr";
    job.render = (options.render ?? startSandboxRender)({
      project,
      outputPath: join(project.dir, "renders", outputName(preview)),
      format: "mp4",
      fps: { num: 30, den: 1 },
      quality: "high",
      jobId: `${project.id}_${preview ? "preview" : "video"}`,
      composition: "index.html",
      telemetryOptOut: true,
      hdrMode,
    });
    const cancel = () => job.render?.cancel?.();
    job.controller.signal.addEventListener("abort", cancel, { once: true });
    try {
      if (job.controller.signal.aborted) cancel();
      while (job.render.status === "rendering")
        await new Promise((resolve) => setTimeout(resolve, options.pollMilliseconds ?? 250));
      job.controller.signal.throwIfAborted();
      if (job.render.status !== "complete")
        throw new Error(job.render.error ?? "Studio rendering did not complete");
      return await outputSize(project, preview);
    } finally {
      job.controller.signal.removeEventListener("abort", cancel);
      await job.render.settled;
    }
  }
  async function execute(
    owner: string,
    input: CompositionInput,
    job: ActiveJob,
    base?: CompositionReceipt,
  ) {
    const key = `${owner}/${job.receipt.artifact_id}`;
    try {
      const title =
        "plan" in input ? input.plan.title : (input.derive.title ?? "Trimmed composition");
      const id = job.receipt.artifact_id;
      const prepared = await options.store.snapshots.resolve(owner, id);
      const preparedBaseline = await options.store.baselines.resolve(owner, id);
      const staged =
        prepared && preparedBaseline
          ? null
          : await options.store.staged.ensure(owner, id, title, async (stage) => {
              const source = await options.store.sources.resolve(owner, id);
              const baselineID = job.receipt.baseline_artifact_id ?? base?.artifact_id;
              const oldBaseline = baselineID
                ? ((await options.store.baselines.resolve(owner, baselineID)) ??
                  (await options.store.completed(owner, baselineID)))
                : undefined;
              const candidateDir = join(stage.dir, "candidate");
              const baselineDir = join(stage.dir, "baseline");
              await mkdir(candidateDir);
              await mkdir(baselineDir);
              if ("plan" in input) {
                const generated = await options.store.generated.ensure(
                  owner,
                  id,
                  title,
                  (project) => preparePlan(project, input.plan, job.controller.signal),
                );
                if (source && oldBaseline) {
                  await mergeCompositionProject({
                    baseDir: oldBaseline.dir,
                    currentDir: source.dir,
                    generatedDir: generated.dir,
                    outputDir: candidateDir,
                    baselineOutputDir: baselineDir,
                  });
                } else {
                  await copyCompositionFiles(generated.dir, candidateDir);
                  await copyCompositionFiles(generated.dir, baselineDir);
                }
              } else {
                if (!source || !oldBaseline) throw new Error("Original composition unavailable");
                await prepareDerivation({ id, title, dir: candidateDir }, input.derive, source, id);
                // The automatic baseline receives the identical window. Manual differences remain
                // differences on the next regeneration instead of becoming generated content.
                await prepareDerivation(
                  { id, title, dir: baselineDir },
                  { ...input.derive, expected_duration: undefined },
                  oldBaseline,
                  id,
                  true,
                );
              }
              await projectSize(candidateDir, maxBytes);
            });
      const project = await options.store.snapshots.ensure(owner, id, title, async (project) => {
        if (!staged) throw new Error("Prepared composition unavailable");
        await copyCompositionFiles(join(staged.dir, "candidate"), project.dir);
      });
      const baseline = await options.store.baselines.ensure(owner, id, title, async (project) => {
        if (!staged) throw new Error("Prepared baseline unavailable");
        await copyCompositionFiles(join(staged.dir, "baseline"), project.dir);
      });
      const manuallyEdited =
        (await workspaceRevision(project.dir)) !== (await workspaceRevision(baseline.dir));
      const effective = readEffectiveComposition(
        await compositionTextFiles(project.dir),
        manuallyEdited,
      );
      job.receipt.effective_timeline = effective;
      job.receipt.manually_edited = manuallyEdited;
      job.receipt.duration = effective.duration;
      job.receipt.width = effective.width;
      job.receipt.height = effective.height;
      job.controller.signal.throwIfAborted();
      job.receipt.status = "rendering";
      await options.store.write(owner, job.receipt);
      job.receipt.size = await waitForRender(job, project, false);
      if (job.receipt.preview_available) await waitForRender(job, project, true);
      job.receipt.status = "complete";
      job.receipt.progress = 100;
      await options.store.staged.remove(owner, id);
      await options.store.generated.remove(owner, id);
      await options.store.sources.remove(owner, id);
    } catch (error) {
      job.receipt.status = job.controller.signal.aborted ? "cancelled" : "failed";
      job.receipt.error =
        error instanceof Error ? error.message.slice(0, 2000) : "Composition rendering failed";
    } finally {
      try {
        await options.store.write(owner, job.receipt);
      } finally {
        active.delete(key);
      }
    }
  }
  async function start(
    owner: string,
    id: string,
    input: CompositionInput,
  ): Promise<CompositionReceipt> {
    const key = `${owner}/${id}`;
    return options.store.withOwner(owner, () =>
      locked(key, async () => {
        await options.store.assertAvailable(owner, id, input.scope_id);
        const hash = contentHash(input, options.mediaOrigin);
        const existing = await options.store.read(owner, id);
        if (existing && existing.hash !== hash)
          throw new HTTPException(409, {
            message: "This composition identifier already belongs to a different plan.",
          });
        if (existing && (active.has(key) || existing.status === "complete"))
          return receipt(owner, id);
        if (!input.base_artifact_id && input.source_clip_id) {
          const legacyIDs = [
            stableProjectId(`clip:${input.source_clip_id}`),
            stableProjectId(
              `story-sources-v1:${input.source_clip_id}:${input.legacy_story_version ?? 0}`,
            ),
          ];
          for (const legacyID of legacyIDs)
            if (await editable.resolve(owner, legacyID)) throw new LegacyWorkspaceConflict();
        }
        let base: CompositionReceipt | undefined;
        if (input.base_artifact_id) {
          if (input.base_artifact_id === id)
            throw new HTTPException(422, {
              message: "A derived composition needs a new identifier",
            });
          base = await receipt(owner, input.base_artifact_id);
          await options.store.assertAvailable(owner, base.artifact_id, base.scope_id);
          if (base.status !== "complete")
            throw new HTTPException(422, {
              message: "The original composition is unavailable",
            });
        }
        if (input.export_only && !base)
          throw new HTTPException(422, {
            message: "An export variant requires an original composition",
          });
        if (input.scope_id && base?.scope_id && input.scope_id !== base.scope_id)
          throw new HTTPException(409, { message: "Composition belongs to a different scope" });
        const projectID = base
          ? await options.store.workspaceID(owner, base.artifact_id, input.project_id)
          : (input.project_id ?? id);
        const plan = "plan" in input ? input.plan : undefined;
        const initial: CompositionReceipt = existing ?? {
          artifact_id: id,
          ...((input.scope_id ?? base?.scope_id)
            ? { scope_id: input.scope_id ?? base?.scope_id }
            : {}),
          project_id: projectID,
          ...(base ? { base_artifact_id: base.artifact_id } : {}),
          export_only: input.export_only === true,
          hash,
          status: "preparing",
          progress: 0,
          duration:
            plan?.duration ?? ("derive" in input ? input.derive.end - input.derive.start : 0),
          width: plan?.width ?? base?.width ?? 0,
          height: plan?.height ?? base?.height ?? 0,
          preview_available: plan
            ? plan.dynamic_range === "hdr"
            : (base?.preview_available ?? false),
        };
        if (!existing)
          await withWorkspace(owner, projectID, async () => {
            const current =
              input.export_only && base
                ? await options.store.completed(owner, base.artifact_id)
                : await editable.resolve(owner, projectID);
            initial.workspace_absent = !current;
            initial.base_revision = current
              ? await workspaceRevision(current.dir)
              : EMPTY_WORKSPACE_REVISION;
            const recovered =
              current && !input.export_only
                ? await options.store.recoverWorkspacePublication(
                    owner,
                    projectID,
                    initial.base_revision,
                  )
                : undefined;
            const head = recovered ?? (await options.store.workspaceHead(owner, projectID));
            if (current && !base) {
              // A worker can lose its database acknowledgement after Studio has
              // committed. A fresh attempt may recover only this scoped, trusted
              // publication, never infer lineage from editable project contents.
              const saved = head ? await options.store.read(owner, head) : null;
              const lineageConflict = () =>
                new HTTPException(409, {
                  message: "An existing Studio project requires its original artifact lineage",
                });
              if (
                !input.project_id ||
                !input.scope_id ||
                !saved ||
                saved.status !== "complete" ||
                saved.export_only ||
                !saved.committed_revision ||
                saved.project_id !== projectID ||
                saved.scope_id !== input.scope_id
              )
                throw lineageConflict();
              for (const candidate of await options.store.scopeArtifacts(owner, input.scope_id)) {
                const pending = await options.store.read(owner, candidate);
                if (
                  pending?.project_id === projectID &&
                  pending.publishing_revision &&
                  !pending.committed_revision
                )
                  throw new HTTPException(409, {
                    message:
                      "Studio has an interrupted publication; retry the accepted operation first",
                  });
              }
              await options.store.assertAvailable(owner, saved.artifact_id, saved.scope_id);
              await options.store.completed(owner, saved.artifact_id);
              const baseline = await options.store.baselines.resolve(owner, saved.artifact_id);
              if (
                !baseline ||
                (await readFile(join(baseline.dir, ".canonical-composition"), "utf8").catch(
                  () => "",
                )) !== "1\n"
              )
                throw lineageConflict();
              base = saved;
              initial.base_artifact_id = saved.artifact_id;
            }
            const source =
              current ?? (base ? await options.store.completed(owner, base.artifact_id) : null);
            initial.baseline_artifact_id = input.export_only
              ? base?.artifact_id
              : (head ?? base?.artifact_id);
            if (source) {
              try {
                await projectSize(source.dir, maxBytes);
              } catch (error) {
                throw new HTTPException(413, {
                  message:
                    error instanceof Error
                      ? error.message
                      : "The saved Studio project exceeds its source budget",
                });
              }
              if ("derive" in input) {
                const effective = readEffectiveComposition(await compositionTextFiles(source.dir));
                if (
                  input.derive.end > effective.duration + 0.002 ||
                  (input.derive.expected_duration !== undefined &&
                    Math.abs(effective.duration - input.derive.expected_duration) > 0.12)
                )
                  throw new HTTPException(409, {
                    message: "The saved Studio timeline changed; refresh the trim range and retry",
                  });
              }
              const captured = await options.store.sources.ensure(
                owner,
                id,
                source.title,
                (snapshot) => copyCompositionFiles(source.dir, snapshot.dir),
              );
              // If preparation was interrupted before its receipt was reserved, the frozen
              // source remains authoritative. CAS must compare its bytes, never newer saves.
              if (current) initial.base_revision = await workspaceRevision(captured.dir);
            }
          });
        const saved = await options.store.reserve(owner, initial);
        if (active.has(key) || saved.status === "complete") return receipt(owner, id);
        const job: ActiveJob = { receipt: initial, controller: new AbortController() };
        initial.status = "preparing";
        initial.progress = 0;
        delete initial.error;
        await options.store.write(owner, initial);
        active.set(key, job);
        job.done = execute(owner, input, job, base).catch(() => {
          active.delete(key);
        });
        return initial;
      }),
    );
  }
  async function erase(owner: string, ids: string[], scope?: string, purge = false) {
    return options.store.withOwner(owner, async () => {
      if ((await options.store.ownerDeleted(owner)) && !purge) return;
      if (purge) {
        await options.store.tombstoneOwner(owner);
        await editable.disableOwner(owner);
      } else {
        if (scope) ids = await options.store.scopeArtifacts(owner, scope);
        await options.store.tombstone(owner, ids, scope);
      }
      const selected = new Set(ids);
      const running = [...active.entries()].filter(
        ([key, job]) =>
          key.startsWith(`${owner}/`) && (purge || selected.has(job.receipt.artifact_id)),
      );
      for (const [, job] of running) job.controller.abort();
      await Promise.allSettled(running.map(([, job]) => job.done));
      // Runtime jobs may still write into editable copies; drain them before removal.
      const release = await options.closeOwner?.(owner);
      try {
        if (purge) await options.store.removeOwner(owner, editable);
        else await options.store.removeArtifacts(owner, ids, editable);
      } finally {
        release?.();
      }
    });
  }
  async function commit(owner: string, id: string) {
    return options.store.withOwner(owner, async () => {
      const saved = await receipt(owner, id);
      if (
        saved.status !== "complete" ||
        !saved.project_id ||
        !saved.base_revision ||
        saved.export_only
      )
        throw new HTTPException(409, {
          message: "This composition cannot be published to the editable project",
        });
      return withWorkspace(owner, saved.project_id, async () => {
        const project = await options.store.completed(owner, id);
        const current = await editable.resolve(owner, saved.project_id!);
        const revision = current ? await workspaceRevision(current.dir) : EMPTY_WORKSPACE_REVISION;
        if (saved.committed_revision) {
          if (revision !== saved.committed_revision)
            throw new HTTPException(409, {
              message: "The Studio project changed after this composition was accepted",
            });
          return { ...publicReceipt(saved), committed: true };
        }
        const candidateRevision = await workspaceRevision(project.dir);
        const recoveringPublication =
          saved.publishing_revision === candidateRevision && revision === candidateRevision;
        if (!recoveringPublication && revision !== saved.base_revision)
          throw new HTTPException(409, {
            message:
              "The Studio project changed during rendering; retry to include the latest saved edits",
          });
        saved.publishing_revision = candidateRevision;
        await options.store.write(owner, saved);
        if (!recoveringPublication)
          await editable.publish(owner, saved.project_id!, project.title, (workspace) =>
            copyCompositionFiles(project.dir, workspace.dir),
          );
        await options.store.registerWorkspace(owner, id, saved.project_id!, project.title, true);
        saved.committed_revision = candidateRevision;
        delete saved.publishing_revision;
        await options.store.write(owner, saved);
        await options.workspaceCommitted?.(owner, saved.project_id!);
        return { ...publicReceipt(saved), committed: true };
      });
    });
  }
  return async function handle(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST" || request.headers.has("Origin"))
        return Response.json({ error: "Composition service request rejected" }, { status: 403 });
      const raw = await request.text();
      if (Buffer.byteLength(raw) > COMPOSITION_REQUEST_MAX_BYTES)
        return Response.json({ error: "Composition request is too large" }, { status: 413 });
      const owner = verifyCompositionGrant(
        raw,
        request.headers.get("X-Studio-Composition-Grant"),
        options.secret,
        options.now?.(),
      );
      if (!owner) return Response.json({ error: "Invalid composition grant" }, { status: 401 });
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new HTTPException(422, { message: "Invalid composition JSON" });
      }
      if (!record(body) || !record(body.input))
        throw new HTTPException(422, { message: "Invalid composition request" });
      fields(body, ["operation", "request_id", "input"]);
      const requestID = identifier(body.request_id);
      const input = body.input;
      const lineage = () => {
        if (input.export_only !== undefined && typeof input.export_only !== "boolean")
          throw new HTTPException(422, { message: "Invalid export variant" });
        if (
          input.legacy_story_version !== undefined &&
          (typeof input.legacy_story_version !== "number" ||
            !Number.isSafeInteger(input.legacy_story_version) ||
            input.legacy_story_version < 0)
        )
          throw new HTTPException(422, { message: "Invalid Story version" });
        return {
          ...(input.scope_id !== undefined ? { scope_id: identifier(input.scope_id) } : {}),
          ...(input.project_id !== undefined ? { project_id: identifier(input.project_id) } : {}),
          ...(input.base_artifact_id !== undefined
            ? { base_artifact_id: identifier(input.base_artifact_id) }
            : {}),
          ...(input.export_only !== undefined ? { export_only: input.export_only } : {}),
          ...(input.source_clip_id !== undefined
            ? { source_clip_id: identifier(input.source_clip_id) }
            : {}),
          ...(typeof input.legacy_story_version === "number"
            ? { legacy_story_version: input.legacy_story_version }
            : {}),
        };
      };
      if (body.operation === "composition.commit") {
        fields(input, ["artifact_id"]);
        return Response.json(await commit(owner, identifier(input.artifact_id)));
      }
      if (body.operation === "composition.delete") {
        fields(input, ["artifact_ids"]);
        if (
          !Array.isArray(input.artifact_ids) ||
          input.artifact_ids.length < 1 ||
          input.artifact_ids.length > 200
        )
          throw new HTTPException(422, {
            message: "Provide between 1 and 200 composition identifiers",
          });
        const ids = [...new Set(input.artifact_ids.map(identifier))];
        await erase(owner, ids);
        return Response.json({ deleted: true, artifact_ids: ids });
      }
      if (body.operation === "composition.delete_scope") {
        fields(input, ["scope_id"]);
        const scope = identifier(input.scope_id);
        await erase(owner, [], scope);
        return Response.json({ deleted: true });
      }
      if (body.operation === "composition.purge_owner") {
        fields(input, []);
        await erase(owner, [], undefined, true);
        return Response.json({ deleted: true });
      }
      if (body.operation === "composition.render") {
        fields(input, [
          "plan",
          "scope_id",
          "project_id",
          "base_artifact_id",
          "export_only",
          "source_clip_id",
          "legacy_story_version",
        ]);
        let plan: CanonicalCompositionPlan;
        try {
          plan = parseCanonicalComposition(input.plan);
        } catch (error) {
          throw new HTTPException(422, {
            message: error instanceof Error ? error.message : "Invalid composition plan",
          });
        }
        for (const asset of plan.assets) {
          mediaURL(asset.url);
          if (asset.preview_url) mediaURL(asset.preview_url);
        }
        return Response.json(publicReceipt(await start(owner, requestID, { plan, ...lineage() })), {
          status: 202,
        });
      }
      if (body.operation === "composition.derive") {
        fields(input, [
          "base_artifact_id",
          "trim",
          "title",
          "scope_id",
          "project_id",
          "export_only",
          "remove_platform_badge",
          "expected_duration",
          "source_clip_id",
          "legacy_story_version",
        ]);
        const base_artifact_id = identifier(input.base_artifact_id);
        if (
          (input.remove_platform_badge !== undefined &&
            typeof input.remove_platform_badge !== "boolean") ||
          (input.expected_duration !== undefined &&
            (typeof input.expected_duration !== "number" ||
              !Number.isFinite(input.expected_duration) ||
              input.expected_duration <= 0))
        )
          throw new HTTPException(422, { message: "Invalid trim precondition" });
        if (input.remove_platform_badge && input.export_only !== true)
          throw new HTTPException(422, { message: "Badge removal requires an export variant" });
        if (!record(input.trim))
          throw new HTTPException(422, { message: "A trim window is required" });
        fields(input.trim, ["start", "end"]);
        const { start: startTime, end } = input.trim;
        if (
          typeof startTime !== "number" ||
          !Number.isFinite(startTime) ||
          startTime < 0 ||
          typeof end !== "number" ||
          !Number.isFinite(end) ||
          end <= startTime ||
          end > 3600 ||
          (input.title !== undefined &&
            (typeof input.title !== "string" || input.title.length > 160))
        )
          throw new HTTPException(422, { message: "Invalid composition trim" });
        const derive = {
          start: startTime,
          end,
          ...(typeof input.title === "string" ? { title: input.title } : {}),
          ...(typeof input.expected_duration === "number"
            ? { expected_duration: input.expected_duration }
            : {}),
          ...(input.remove_platform_badge === true ? { remove_platform_badge: true } : {}),
        };
        return Response.json(
          publicReceipt(await start(owner, requestID, { derive, ...lineage(), base_artifact_id })),
          {
            status: 202,
          },
        );
      }
      if (
        !["composition.status", "composition.output", "composition.cancel"].includes(
          String(body.operation),
        )
      )
        throw new HTTPException(422, { message: "Unsupported composition operation" });
      fields(
        input,
        body.operation === "composition.output" ? ["artifact_id", "variant"] : ["artifact_id"],
      );
      const id = identifier(input.artifact_id);
      const state = await receipt(owner, id);
      if (body.operation === "composition.cancel") {
        active.get(`${owner}/${id}`)?.controller.abort();
        return Response.json(publicReceipt(state));
      }
      if (body.operation === "composition.output") {
        if (input.variant !== undefined && input.variant !== "video" && input.variant !== "preview")
          throw new HTTPException(422, { message: "Unsupported composition output" });
        const preview = input.variant === "preview";
        if (state.status !== "complete" || (preview && !state.preview_available))
          throw new HTTPException(409, { message: "Composition output is not ready" });
        const project = await options.store.completed(owner, id);
        const size = await outputSize(project, preview);
        return new Response(Bun.file(join(project.dir, "renders", outputName(preview))), {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(size),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return Response.json(publicReceipt(state));
    } catch (error) {
      return Response.json(
        {
          ...(error instanceof LegacyWorkspaceConflict
            ? { code: "legacy_project_requires_studio" }
            : {}),
          error:
            error instanceof HTTPException
              ? error.message
              : "The composition service could not complete the request",
        },
        { status: error instanceof HTTPException ? error.status : 500 },
      );
    }
  };
}
