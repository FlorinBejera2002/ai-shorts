import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAgentBridge } from "./agent";
import { HTTPException } from "hono/http-exception";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  EditorSessions,
  SESSION_COOKIE,
  SESSION_SECONDS,
  verifyBearer,
  type EditorUser,
} from "./auth";
import type { ProjectStore, StoredProject } from "./store";
import { openEmptyWorkspace } from "./clip-import";

export interface EditorAppOptions {
  appOrigin: string;
  additionalAppOrigins?: string[];
  editorOrigin: string;
  authBaseUrl: string;
  store: ProjectStore;
  createStudioApiForUser: (user: EditorUser) => Hono | Promise<Hono>;
  initializeProject?: (project: StoredProject) => Promise<void>;
  importClip?: (userId: string, bearer: string, clipId: string) => Promise<StoredProject>;
  fetchAuth?: import("./auth").AuthFetcher;
  now?: () => number;
  agentSecret?: string;
}
const publicProject = ({ id, title }: StoredProject) => ({ id, title });
export function normalizeAppOrigin(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid application origin");
  return url.origin;
}
export function createApp(options: EditorAppOptions) {
  const app = new Hono<{ Variables: { user: EditorUser; bearer: string } }>();
  app.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof HTTPException
            ? error.message
            : "Studio could not complete the request. Please try again.",
      },
      error instanceof HTTPException ? error.status : 500,
    ),
  );
  const sessions = new EditorSessions(options.now);
  const appOrigins = new Set(
    [options.appOrigin, ...(options.additionalAppOrigins ?? [])].map(normalizeAppOrigin),
  );
  const editorUrl = new URL(options.editorOrigin);
  const secure = !["localhost", "127.0.0.1", "[::1]"].includes(editorUrl.hostname);
  const apis = new Map<string, Promise<Hono>>();
  function userApi(user: EditorUser): Promise<Hono> {
    let api = apis.get(user.id);
    if (!api) {
      api = Promise.resolve().then(() => options.createStudioApiForUser(user));
      apis.set(user.id, api);
      api.catch(() => {
        if (apis.get(user.id) === api) apis.delete(user.id);
      });
    }
    return api;
  }
  const bridge = createAgentBridge({
    secret: options.agentSecret,
    store: options.store,
    now: options.now,
    api: (user) => userApi({ id: user, name: null }),
    initialize: async (project) => {
      if (!options.initializeProject)
        throw new HTTPException(503, { message: "Studio initialization unavailable" });
      await options.initializeProject(project);
    },
  });
  // Service grants cannot be used on browser endpoints or arbitrary Studio APIs.
  app.post("/sneepcut/agent", bodyLimit({ maxSize: 24000 }), (c) => bridge(c.req.raw));
  app.use("*", async (c, next) => {
    if (
      c.req.path !== "/health" &&
      (c.req.header("Host") ?? new URL(c.req.url).host) !== editorUrl.host
    )
      return c.json({ error: "Host rejected" }, 403);
    const origin = c.req.header("Origin");
    if (origin && appOrigins.has(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Vary", "Origin");
    }
    if (c.req.method === "OPTIONS") {
      if ((!origin || !appOrigins.has(origin)) && origin !== editorUrl.origin)
        return c.json({ error: "Origin rejected" }, 403);
      c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      c.header("Access-Control-Allow-Headers", "Authorization,Content-Type,If-Match,If-None-Match");
      return c.body(null, 204);
    }
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      (!origin || !appOrigins.has(origin)) &&
      origin !== editorUrl.origin
    ) {
      // Nonbrowser clients must provide a freshly verified bearer, never cookie-only CSRF bypass.
      if (origin || !c.req.header("Authorization"))
        return c.json({ error: "Origin rejected" }, 403);
    }
    if (c.req.path === "/health" && c.req.method === "GET") return c.json({ status: "ok" });
    const authorization = c.req.header("Authorization");
    const session = sessions.get(getCookie(c, SESSION_COOKIE));
    const user = await verifyBearer(
      authorization ?? session?.bearer,
      options.authBaseUrl,
      options.fetchAuth,
    );
    if (!user || (!authorization && session && user.id !== session.user.id)) {
      sessions.delete(getCookie(c, SESSION_COOKIE));
      return c.json({ error: "Authentication required" }, 401);
    }
    c.set("user", user);
    c.set("bearer", authorization ?? session?.bearer ?? "");
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.post("/sneepcut/session", async (c) => {
    if (!c.req.header("Authorization")) return c.json({ error: "Bearer required" }, 401);
    sessions.delete(getCookie(c, SESSION_COOKIE));
    setCookie(
      c,
      SESSION_COOKIE,
      sessions.create(c.get("user"), c.req.header("Authorization") ?? ""),
      { httpOnly: true, secure, sameSite: "Strict", path: "/", maxAge: SESSION_SECONDS },
    );
    return c.json({ user: c.get("user"), expiresIn: SESSION_SECONDS });
  });
  app.delete("/sneepcut/session", (c) => {
    sessions.delete(getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure, sameSite: "Strict" });
    return c.json({ ok: true });
  });
  app.get("/sneepcut/me", (c) => c.json({ user: c.get("user") }));
  app.get("/sneepcut/projects", async (c) =>
    c.json({ projects: (await options.store.list(c.get("user").id)).map(publicProject) }),
  );
  app.post("/sneepcut/workspace", async (c) =>
    c.json({ project: publicProject(await openEmptyWorkspace(options.store, c.get("user").id)) }),
  );
  app.post("/sneepcut/clips/:id/open", async (c) => {
    if (!options.importClip) return c.json({ error: "Clip imports are unavailable" }, 503);
    const project = await options.importClip(c.get("user").id, c.get("bearer"), c.req.param("id"));
    return c.json({ project: publicProject(project) });
  });
  app.post("/sneepcut/projects", async (c) => {
    let body: unknown;
    if (Number(c.req.header("Content-Length")) > 2048)
      return c.json({ error: "Request too large" }, 413);
    try {
      const raw = await c.req.text();
      if (raw.length > 2048) return c.json({ error: "Request too large" }, 413);
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("title" in body) ||
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.trim().length > 160
    )
      return c.json({ error: "Title must contain 1–160 characters" }, 400);
    const project = await options.store.create(c.get("user").id, body.title);
    await options.initializeProject?.(project);
    return c.json({ project: publicProject(project) }, 201);
  });
  app.all("/api/*", async (c) => {
    const user = c.get("user");
    const api = userApi(user);
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace(/^\/api/, "") || "/";
    return (await api).fetch(new Request(url, c.req.raw));
  });
  return app;
}
