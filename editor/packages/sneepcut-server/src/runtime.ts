import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createStudioApi,
  consumeFileWriteReceipt,
  fileContentVersion,
  type StudioApiAdapter,
  type ResolvedProject,
} from "@hyperframes/studio-server";
import { createStudioServer, type StudioServer } from "../../cli/src/server/studioServer";
import { shouldWatchProjectFile } from "../../cli/src/server/fileWatcher";
import { readGlobalAssets, toPublicAsset } from "../../studio-server/src/routes/globalAssets";
import { createAiRoutes } from "./ai";
import type { ProjectStore } from "./store";
import { startSandboxRender, sandboxThumbnail, startSandboxBackgroundRemoval } from "./sandbox";
import { bundledGsap, localizeGsap } from "./assets";
import { parseHTML } from "linkedom";
import { withWorkspace, trackWorkspaceWrite, workspaceFileIncluded } from "./workspace";
import { isUUID } from "./store";
import { RuntimeLifecycle } from "./runtime-lifecycle";

/** Preview-only transport; persisted HTML and the renderer always keep originals. */
export function canonicalPreviewSources(html: string): string {
  if (!html.includes("data-preview-src")) return html;
  const { document } = parseHTML(html);
  for (const element of document.querySelectorAll(
    "video[data-preview-src],audio[data-preview-src]",
  )) {
    const preview = element.getAttribute("data-preview-src");
    if (
      !preview ||
      !/^(?:source\/)*assets\/[a-zA-Z0-9_./-]+$/.test(preview) ||
      preview.split("/").includes("..")
    )
      throw new Error("Invalid preview source");
    element.setAttribute("data-render-src", element.getAttribute("src") ?? "");
    element.setAttribute("src", preview);
  }
  return document.toString();
}

/** Keep the complete upstream editor API, with a separate API/job store per account. */
export function createUserRuntime(userId: string, store: ProjectStore) {
  const lifecycle = new RuntimeLifecycle();
  const projects = new Map<string, StudioServer>();
  const projectDirectories = new Map<string, string>();
  const listeners = new Set<(event: unknown) => void>();
  function runtime(project: ResolvedProject): StudioServer {
    lifecycle.ensureOpen();
    const existing = projects.get(project.id);
    if (existing && projectDirectories.get(project.id) === project.dir) return existing;
    existing?.watcher.close();
    const server = createStudioServer({ projectDir: project.dir, projectName: project.id });
    server.watcher.addListener((path) => {
      if (
        !shouldWatchProjectFile(path) ||
        path.split(/[\\/]/).some((part) => !workspaceFileIncluded(part))
      )
        return;
      let receipt: unknown = null;
      try {
        const absolutePath = join(project.dir, path);
        receipt = consumeFileWriteReceipt(
          absolutePath,
          fileContentVersion(readFileSync(absolutePath)),
        );
      } catch {
        /* A deleted file has no write receipt. */
      }
      for (const listener of listeners) listener(receipt ?? { path, projectId: project.id });
    });
    projects.set(project.id, server);
    projectDirectories.set(project.id, project.dir);
    return server;
  }
  async function byDirectory(dir: string) {
    const project = (await store.list(userId)).find((entry) => entry.dir === dir);
    if (!project) throw new Error("Project not found");
    return runtime(project).adapter;
  }
  const adapter: StudioApiAdapter = {
    lifecycleSignal: lifecycle.signal,
    listProjects: () => store.list(userId),
    async resolveProject(id) {
      const project = await store.resolve(userId, id);
      if (project) runtime(project);
      return project;
    },
    async bundle(dir) {
      return (await byDirectory(dir)).bundle(dir);
    },
    async lint(html, options) {
      const { lintHyperframeHtml } = await import("@hyperframes/lint");
      return lintHyperframeHtml(html, options);
    },
    async lintProject(dir) {
      return (await byDirectory(dir)).lintProject!(dir);
    },
    async transformPreviewHtml(options) {
      return canonicalPreviewSources(
        await runtime(options.project).adapter.transformPreviewHtml!(options),
      );
    },
    runtimeUrl: "/api/runtime.js",
    rendersDir: (project) => join(project.dir, "renders"),
    startRender(options) {
      lifecycle.ensureOpen();
      const job = lifecycle.trackJob(startSandboxRender(options));
      trackWorkspaceWrite(userId, options.project.id, job.settled);
      return job;
    },
    startBackgroundRemoval(options) {
      lifecycle.ensureOpen();
      const job = lifecycle.trackJob(startSandboxBackgroundRemoval(options));
      trackWorkspaceWrite(userId, options.project.id, job.settled);
      return job;
    },
    generateThumbnail(options) {
      lifecycle.ensureOpen();
      const signals = options.signal ? [options.signal, lifecycle.signal] : [lifecycle.signal];
      return sandboxThumbnail({ ...options, signal: AbortSignal.any(signals) });
    },
    async listRegistryCatalog() {
      const { listRegistryItems, loadAllItems } = await import("../../cli/src/registry/resolver");
      const entries = await listRegistryItems();
      return loadAllItems(
        entries.filter(
          (entry) => entry.type === "hyperframes:block" || entry.type === "hyperframes:component",
        ),
      );
    },
    async installRegistryBlock(options) {
      return runtime(options.project).adapter.installRegistryBlock!(options);
    },
  };
  const api = new Hono();
  api.use("*", async (c, next) => {
    const id = /^\/projects\/([^/]+)(?:\/|$)/.exec(c.req.path)?.[1];
    if (!id) return next();
    if (!isUUID(id)) return c.json({ error: "Invalid project identifier" }, 400);
    // Legacy projects can still have their private container at the project root.
    // New generations live below it, but neither layout exposes its head controls.
    const privatePath = (value: string) =>
      value
        .split(/[\\/]/)
        .some(
          (part) =>
            part === ".revisions" || part === ".sneepcut-project.json" || part.startsWith(".head-"),
        );
    const containsPrivatePath = (value: unknown, depth = 0): boolean => {
      if (depth > 50) return true;
      if (typeof value === "string") return privatePath(value);
      if (Array.isArray(value)) return value.some((entry) => containsPrivatePath(entry, depth + 1));
      return (
        value !== null &&
        typeof value === "object" &&
        Object.values(value).some((entry) => containsPrivatePath(entry, depth + 1))
      );
    };
    if (
      privatePath(decodeURIComponent(c.req.path)) ||
      [...new URL(c.req.url).searchParams.values()].some(privatePath)
    )
      return c.json({ error: "Private project metadata" }, 403);
    if (
      c.req.header("Content-Type")?.includes("application/json") &&
      !["GET", "HEAD"].includes(c.req.method)
    ) {
      const body: unknown = await c.req.raw
        .clone()
        .json()
        .catch(() => null);
      if (containsPrivatePath(body)) return c.json({ error: "Private project metadata" }, 403);
    }
    return withWorkspace(userId, id, next);
  });
  api.use("*", async (c, next) => {
    const release = lifecycle.admitRequest();
    if (!release) return c.json({ error: "Studio account runtime is closed" }, 410);
    try {
      await next();
    } finally {
      release();
    }
  });
  api.use("*", async (c, next) => {
    await next();
    if (c.res.headers.get("Content-Type")?.includes("text/html")) {
      const headers = new Headers(c.res.headers);
      headers.delete("Content-Length");
      c.res = new Response(localizeGsap(await c.res.text()), { status: c.res.status, headers });
    }
  });
  api.get("/vendor/gsap/:filename", (c) => {
    const bytes = bundledGsap(c.req.param("filename"));
    return bytes
      ? c.body(Uint8Array.from(bytes), 200, { "Content-Type": "text/javascript" })
      : c.notFound();
  });
  api.get("/projects", async (c) =>
    c.json({ projects: (await store.list(userId)).map(({ id, title }) => ({ id, title })) }),
  );
  api.get("/assets/global", async (c) =>
    c.json({ assets: readGlobalAssets(await store.userHome(userId)).map(toPublicAsset) }),
  );
  api.get("/runtime.js", (c) =>
    c.body(
      Uint8Array.from(
        readFileSync(new URL("../../core/dist/hyperframe.runtime.iife.js", import.meta.url)),
      ),
      200,
      { "Content-Type": "text/javascript" },
    ),
  );
  api.get("/telemetry-identity", (c) => c.json({ distinctId: null }));
  api.get("/environment/ffmpeg", async (c) => {
    const { runEnvironmentChecks } = await import("../../cli/src/browser/preflight");
    const { outcomes } = await runEnvironmentChecks();
    const failed = outcomes.find((outcome) => !outcome.ok);
    return c.json(
      failed
        ? { ok: false, title: failed.title, detail: failed.detail, hint: failed.hint }
        : { ok: true },
    );
  });
  api.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      const closeStream = () => stream.abort();
      lifecycle.signal.addEventListener("abort", closeStream, { once: true });
      const listener = (event: unknown) => {
        void stream.writeSSE({ event: "file-change", data: JSON.stringify(event) }).catch(() => {});
      };
      listeners.add(listener);
      stream.onAbort(() => {
        listeners.delete(listener);
      });
      try {
        while (!stream.aborted) await stream.sleep(15000);
      } finally {
        listeners.delete(listener);
        lifecycle.signal.removeEventListener("abort", closeStream);
      }
    }),
  );
  api.route(
    "/",
    createAiRoutes({ userId, resolveProject: (owner, id) => store.resolve(owner, id) }),
  );
  const sharedApi = createStudioApi(adapter);
  api.all("*", (c) => sharedApi.fetch(c.req.raw));
  return {
    api,
    async workspaceCommitted(id: string) {
      const project = await store.resolve(userId, id);
      if (project) runtime(project);
      for (const listener of listeners) listener({ path: "index.html", projectId: id });
    },
    close() {
      return lifecycle.close(() => {
        for (const server of projects.values()) server.watcher.close();
        projects.clear();
        projectDirectories.clear();
        listeners.clear();
      });
    },
  };
}
