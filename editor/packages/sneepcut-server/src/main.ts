import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getMimeType } from "@hyperframes/studio-server";
import { createApp, normalizeAppOrigin } from "./app";
import { ProjectStore } from "./store";
import { createUserRuntime } from "./runtime";
import { initializeProject } from "./starter";

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
const runtimes = new Map<string, ReturnType<typeof createUserRuntime>>();
const app = createApp({
  appOrigin,
  additionalAppOrigins,
  editorOrigin,
  authBaseUrl: process.env.SNEEPCUT_AUTH_BASE_URL ?? "http://localhost:8080",
  store,
  initializeProject,
  createStudioApiForUser(user) {
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
    return new Response(await readFile(filename), {
      headers: {
        "Content-Type": getMimeType(filename),
        "Cache-Control": "no-store",
        "Content-Security-Policy": `frame-ancestors 'self' ${frameAncestors}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
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
