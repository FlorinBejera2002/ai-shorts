import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { ProjectStore } from "./store";

const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const editorOrigin = "https://studio.sneepcut.test";
const appOrigin = "https://app.sneepcut.test";

describe("Studio administrator access", () => {
  let root: string;
  let store: ProjectStore;
  let role: string;
  let deleting: boolean;
  let revoked: boolean;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "studio-admin-auth-"));
    store = new ProjectStore(join(root, "projects"));
    role = "admin";
    deleting = false;
    revoked = false;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function application() {
    return createApp({
      appOrigin,
      editorOrigin,
      authBaseUrl: "https://api.sneepcut.test",
      store,
      fetchAuth: async (_input, init) => {
        if (revoked || new Headers(init?.headers).get("Authorization") !== "Bearer owner")
          return new Response(null, { status: 401 });
        return Response.json({
          user: { id: owner, name: "Owner", access_role: role, deletion_pending: deleting },
        });
      },
      createStudioApiForUser: (user) =>
        new Hono().get("/projects", async (c) =>
          c.json({ projects: (await store.list(user.id)).map(({ id, title }) => ({ id, title })) }),
        ),
    });
  }

  function connect(app: ReturnType<typeof application>) {
    return app.request(`${editorOrigin}/sneepcut/session`, {
      method: "POST",
      headers: { Authorization: "Bearer owner", Origin: appOrigin },
    });
  }

  async function sessionCookie(app: ReturnType<typeof application>) {
    const response = await connect(app);
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    return cookie.split(";")[0];
  }

  it.each(["member", "admin"])("opens only owned projects for %s sessions", async (allowedRole) => {
    role = allowedRole;
    const owned = await store.create(owner, "Owned project");
    const other = await store.create(otherOwner, "Other account project");
    const app = application();
    const cookie = await sessionCookie(app);
    for (const path of ["/sneepcut/projects", "/api/projects"]) {
      const response = await app.request(`${editorOrigin}${path}`, { headers: { Cookie: cookie } });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ projects: [{ id: owned.id, title: owned.title }] });
    }
    expect(await store.resolve(owner, other.id)).toBeNull();
  });

  it.each(["viewer", "unknown"])("rejects a %s role at session creation", async (deniedRole) => {
    role = deniedRole;
    const response = await connect(application());
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["role", "deletion", "revocation"])(
    "invalidates an admin session after %s changes",
    async (change) => {
      const app = application();
      const cookie = await sessionCookie(app);
      if (change === "role") role = "viewer";
      if (change === "deletion") deleting = true;
      if (change === "revocation") revoked = true;
      const read = () =>
        app.request(`${editorOrigin}/api/projects`, { headers: { Cookie: cookie } });
      expect((await read()).status).toBe(401);
      expect((await connect(app)).status).toBe(401);
      role = "admin";
      deleting = false;
      revoked = false;
      expect((await read()).status).toBe(401);
    },
  );
});
