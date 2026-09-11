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

/** Keep the complete upstream editor API, with a separate API/job store per account. */
export function createUserRuntime(userId: string, store: ProjectStore) {
  const projects = new Map<string, StudioServer>();
  const listeners = new Set<(event: unknown) => void>();
  function runtime(project: ResolvedProject): StudioServer {
    const existing = projects.get(project.id);
    if (existing) return existing;
    const server = createStudioServer({ projectDir: project.dir, projectName: project.id });
    server.watcher.addListener((path) => {
      if (!shouldWatchProjectFile(path)) return;
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
    return server;
  }
  async function byDirectory(dir: string) {
    const project = (await store.list(userId)).find((entry) => entry.dir === dir);
    if (!project) throw new Error("Project not found");
    return runtime(project).adapter;
  }
  const adapter: StudioApiAdapter = {
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
      return runtime(options.project).adapter.transformPreviewHtml!(options);
    },
    runtimeUrl: "/api/runtime.js",
    rendersDir: (project) => join(project.dir, "renders"),
    startRender: startSandboxRender,
    startBackgroundRemoval: startSandboxBackgroundRemoval,
    generateThumbnail: sandboxThumbnail,
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
    close() {
      for (const server of projects.values()) server.watcher.close();
      projects.clear();
      listeners.clear();
    },
  };
}
