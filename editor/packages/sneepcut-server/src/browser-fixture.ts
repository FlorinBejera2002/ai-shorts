// Isolated browser verification only. Never used by the production entry point.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { getMimeType } from "@hyperframes/studio-server";
import { createApp } from "./app";
import { ProjectStore } from "./store";
import { createUserRuntime } from "./runtime";
import { initializeProject } from "./starter";

if (process.env.NODE_ENV !== "test") throw new Error("Browser fixture requires NODE_ENV=test");
const origin = "http://localhost:5193";
const userId = "11111111-1111-4111-8111-111111111111";
const root = await mkdtemp(join(tmpdir(), "sneepcut-studio-browser-"));
const store = new ProjectStore(root);
const project = await store.create(userId, "SneepCut verification");
await initializeProject(project);
const runtime = createUserRuntime(userId, store);
const app = createApp({
  appOrigin: origin,
  editorOrigin: origin,
  authBaseUrl: "http://synthetic-auth.invalid",
  store,
  initializeProject,
  createStudioApiForUser: () => runtime.api,
  fetchAuth: async (_url, options) =>
    new Headers(options?.headers).get("Authorization") === "Bearer synthetic-fixture"
      ? Response.json({
          user: {
            id: userId,
            name: "Synthetic test",
            access_role: "member",
            deletion_pending: false,
          },
        })
      : new Response(null, { status: 401 }),
});
const staticRoot = fileURLToPath(new URL("../../studio/dist/", import.meta.url));
app.get("*", async (c) => {
  const path = resolve(staticRoot, c.req.path === "/" ? "index.html" : c.req.path.slice(1));
  const local = relative(staticRoot, path);
  if (local.startsWith("..") || isAbsolute(local)) return c.notFound();
  try {
    return new Response(await readFile(path), { headers: { "Content-Type": getMimeType(path) } });
  } catch {
    return c.notFound();
  }
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 5193,
  idleTimeout: 255,
  async fetch(request) {
    if (new URL(request.url).pathname === "/bootstrap") {
      const session = await app.request(`${origin}/sneepcut/session`, {
        method: "POST",
        headers: { Origin: origin, Authorization: "Bearer synthetic-fixture" },
      });
      if (session.status !== 200) return session;
      return new Response(null, {
        status: 302,
        headers: {
          "Set-Cookie": session.headers.get("Set-Cookie") ?? "",
          Location: `/#project/${project.id}`,
        },
      });
    }
    return app.fetch(request);
  },
});
console.log(`${origin}/bootstrap`);
async function shutdown() {
  server.stop(true);
  runtime.close();
  await rm(root, { recursive: true, force: true });
}
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
