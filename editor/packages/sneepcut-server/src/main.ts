import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getMimeType } from "@hyperframes/studio-server";
import { createApp, normalizeAppOrigin } from "./app";
import { ProjectStore } from "./store";
import { createUserRuntime } from "./runtime";
import { initializeProject } from "./starter";
import { createClipImporter } from "./clip-import";
import { CompositionStore } from "./composition-store";
import { createCompositionService } from "./composition-service";
import { HTTPException } from "hono/http-exception";
import { enableStudioSessionRenewal } from "./session-recovery";

const directory = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.SNEEPCUT_STUDIO_PORT ?? "5191");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid Studio port");
const editorOrigin = process.env.SNEEPCUT_STUDIO_ORIGIN ?? `http://localhost:${port}`;
const appOrigin = normalizeAppOrigin(process.env.SNEEPCUT_APP_ORIGIN ?? "http://localhost:3000");
const additionalAppOrigins = (process.env.SNEEPCUT_APP_ADDITIONAL_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map(normalizeAppOrigin);
const frameAncestors = [...new Set([appOrigin, ...additionalAppOrigins])].join(" ");
const store = new ProjectStore(
  process.env.SNEEPCUT_STUDIO_DATA ?? resolve(directory, "../../../data/sneepcut"),
);
const compositions = new CompositionStore(`${store.root}-compositions`);
const runtimes = new Map<string, ReturnType<typeof createUserRuntime>>();
const runtimeGenerations = new Map<string, number>();
const closingOwners = new Set<string>();
const app = createApp({
  appOrigin,
  additionalAppOrigins,
  editorOrigin,
  authBaseUrl: process.env.SNEEPCUT_AUTH_BASE_URL ?? "http://localhost:8080",
  agentSecret: process.env.STUDIO_AGENT_SECRET,
  store,
  studioApiGeneration: (owner) => runtimeGenerations.get(owner) ?? 0,
  compositionService: createCompositionService({
    store: compositions,
    editableStore: store,
    async workspaceCommitted(owner, projectID) {
      await runtimes.get(owner)?.workspaceCommitted(projectID);
    },
    async closeOwner(owner) {
      closingOwners.add(owner);
      await runtimes.get(owner)?.close();
      return () => {
        runtimes.delete(owner);
        runtimeGenerations.set(owner, (runtimeGenerations.get(owner) ?? 0) + 1);
        closingOwners.delete(owner);
      };
    },
    secret: process.env.STUDIO_AGENT_SECRET,
    mediaOrigin: process.env.SNEEPCUT_MEDIA_ORIGIN ?? appOrigin,
    mediaFetchOrigin: process.env.SNEEPCUT_MEDIA_INTERNAL_ORIGIN,
    mediaS3Origin: process.env.SNEEPCUT_MEDIA_S3_ORIGIN,
  }),
  initializeProject,
  importClip: createClipImporter({
    store,
    compositions,
    apiOrigin: process.env.SNEEPCUT_AUTH_BASE_URL ?? "http://localhost:8080",
    mediaOrigin: process.env.SNEEPCUT_MEDIA_ORIGIN ?? appOrigin,
    mediaFetchOrigin: process.env.SNEEPCUT_MEDIA_INTERNAL_ORIGIN,
  }),
  createStudioApiForUser(user) {
    if (closingOwners.has(user.id))
      throw new HTTPException(410, { message: "Studio cleanup in progress" });
    let runtime = runtimes.get(user.id);
    if (!runtime) {
      runtime = createUserRuntime(user.id, store);
      runtimes.set(user.id, runtime);
    }
    return runtime.api;
  },
});
const staticRoot = await realpath(resolve(directory, "../../studio/dist"));
app.get("*", async (c) => {
  try {
    const requested = c.req.path === "/" ? "index.html" : decodeURIComponent(c.req.path.slice(1));
    const filename = await realpath(join(staticRoot, requested));
    const within = relative(staticRoot, filename);
    if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within))
      return c.notFound();
    const content = await readFile(filename);
    return new Response(
      requested === "index.html" ? enableStudioSessionRenewal(content.toString("utf8")) : content,
      {
        headers: {
          "Content-Type": getMimeType(filename),
          "Cache-Control": "no-store",
          "Content-Security-Policy": `frame-ancestors 'self' ${frameAncestors}`,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return c.notFound();
  }
});
const server = Bun.serve({
  hostname: process.env.SNEEPCUT_STUDIO_HOST ?? "127.0.0.1",
  port,
  maxRequestBodySize: 128 * 1024 * 1024,
  idleTimeout: 255,
  fetch: app.fetch,
});
console.log(`SneepCut Studio listening on ${editorOrigin}`);
function shutdown() {
  for (const runtime of runtimes.values()) runtime.close();
  server.stop(true);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
