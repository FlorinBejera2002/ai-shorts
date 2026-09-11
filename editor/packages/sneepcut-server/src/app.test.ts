import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { ProjectStore } from "./store";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
describe("SneepCut isolated editor host", () => {
  let root: string;
  let store: ProjectStore;
  let now = 1000;
  let revoked = false;
  let role = "member";
  let deleting = false;
  let apiCreations = 0;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sneepcut-editor-test-"));
    store = new ProjectStore(join(root, "projects"));
    now = 1000;
    revoked = false;
    role = "member";
    deleting = false;
    apiCreations = 0;
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  function application(editorOrigin = "http://localhost", additionalAppOrigins: string[] = []) {
    return createApp({
      appOrigin: "https://app.sneepcut.test",
      additionalAppOrigins,
      editorOrigin,
      authBaseUrl: "https://api.sneepcut.test",
      store,
      now: () => now,
      fetchAuth: async (input, init) => {
        expect(String(input)).toBe("https://api.sneepcut.test/v1/auth/me");
        const authorization = new Headers(init?.headers).get("Authorization");
        if (revoked || !["Bearer alice", "Bearer bob"].includes(authorization ?? ""))
          return new Response(null, { status: 401 });
        return Response.json({
          user: {
            id: authorization === "Bearer alice" ? alice : bob,
            access_role: role,
            deletion_pending: deleting,
            name: "Test",
          },
        });
      },
      createStudioApiForUser: async (user) => {
        apiCreations++;
        await Promise.resolve();
        return new Hono().get("/projects", async (c) =>
          c.json({ projects: (await store.list(user.id)).map(({ id, title }) => ({ id, title })) }),
        );
      },
    });
  }
  const memberHeaders = { Authorization: "Bearer alice", Origin: "https://app.sneepcut.test" };
  async function cookie(app: ReturnType<typeof createApp>) {
    const response = await app.request("/sneepcut/session", {
      method: "POST",
      headers: memberHeaders,
    });
    expect(response.status).toBe(200);
    const value = response.headers.get("set-cookie") ?? "";
    expect(value).toContain("HttpOnly");
    expect(value).not.toContain("Secure");
    expect(value).toContain("SameSite=Strict");
    expect(value).not.toContain("alice");
    return value.split(";")[0];
  }
  it("requires authentication and rejects readonly/deleting accounts", async () => {
    const app = application();
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/api/projects")).status).toBe(401);
    role = "viewer";
    expect((await app.request("/sneepcut/me", { headers: memberHeaders })).status).toBe(401);
    role = "member";
    deleting = true;
    expect((await app.request("/sneepcut/me", { headers: memberHeaders })).status).toBe(401);
  });
  it("rejects DNS rebinding and sets secure cookies for public hosts", async () => {
    const app = application("https://editor.sneepcut.test");
    expect(
      (await app.request("https://attacker.test/sneepcut/me", { headers: memberHeaders })).status,
    ).toBe(403);
    const response = await app.request("https://editor.sneepcut.test/sneepcut/session", {
      method: "POST",
      headers: memberHeaders,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
  it("expires, revokes and logs out cookie sessions", async () => {
    const app = application();
    const first = await cookie(app);
    expect((await app.request("/sneepcut/me", { headers: { Cookie: first } })).status).toBe(200);
    now += 900001;
    expect((await app.request("/sneepcut/me", { headers: { Cookie: first } })).status).toBe(401);
    const second = await cookie(app);
    revoked = true;
    expect((await app.request("/sneepcut/me", { headers: { Cookie: second } })).status).toBe(401);
    revoked = false;
    const third = await cookie(app);
    expect(
      (
        await app.request("/sneepcut/session", {
          method: "DELETE",
          headers: { Cookie: third, Origin: memberHeaders.Origin },
        })
      ).status,
    ).toBe(200);
    expect((await app.request("/sneepcut/me", { headers: { Cookie: third } })).status).toBe(401);
  });
  it("rejects cross-site and origin-less cookie mutations", async () => {
    const app = application();
    const session = await cookie(app);
    for (const origin of [undefined, "https://evil.test", "null"]) {
      const headers = new Headers({ Cookie: session });
      if (origin) headers.set("Origin", origin);
      expect(
        (
          await app.request("/sneepcut/projects", {
            method: "POST",
            headers,
            body: JSON.stringify({ title: "bad" }),
          })
        ).status,
      ).toBe(403);
    }
    const preflight = await app.request("/api/projects", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.test" },
    });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("accepts only explicitly configured additional app origins for CORS and cookie mutations", async () => {
    const app = application("http://localhost", ["https://www.sneepcut.test/path"]);
    const session = await cookie(app);
    const allowed = "https://www.sneepcut.test";
    const preflight = await app.request("/sneepcut/projects", {
      method: "OPTIONS",
      headers: { Origin: allowed },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(allowed);
    const created = await app.request("/sneepcut/projects", {
      method: "POST",
      headers: { Cookie: session, Origin: allowed, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Additional origin" }),
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("access-control-allow-origin")).toBe(allowed);
    for (const origin of [
      "https://www.sneepcut.test.evil.test",
      "http://www.sneepcut.test",
      "null",
    ]) {
      const rejected = await app.request("/sneepcut/projects", {
        method: "POST",
        headers: { Cookie: session, Origin: origin },
        body: JSON.stringify({ title: "Rejected" }),
      });
      expect(rejected.status).toBe(403);
      expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
  it("rejects opaque additional app origin configuration", () => {
    expect(() => application("http://localhost", ["data:text/plain,example"])).toThrow();
  });
  it("persists isolated owned projects without leaking server paths", async () => {
    const app = application();
    const created = await app.request("/sneepcut/projects", {
      method: "POST",
      headers: memberHeaders,
      body: JSON.stringify({ title: "My video" }),
    });
    expect(created.status).toBe(201);
    const result = await created.json();
    expect(result.project.title).toBe("My video");
    expect(result.project.dir).toBeUndefined();
    expect(await store.resolve(bob, result.project.id)).toBeNull();
    expect(
      await new ProjectStore(join(root, "projects")).resolve(alice, result.project.id),
    ).not.toBeNull();
    const listing = await app.request("/api/projects", {
      headers: { Authorization: "Bearer bob" },
    });
    expect(await listing.json()).toEqual({ projects: [] });
  });
  it("rejects path traversal and symlink project boundaries", async () => {
    await expect(store.list("../outside")).rejects.toThrow("Invalid identifier");
    expect(await store.resolve(alice, "../../outside")).toBeNull();
    const owned = await store.create(alice, "Owned");
    const otherHome = await store.userHome(bob);
    await symlink(owned.dir, join(otherHome, owned.id), "junction");
    expect(await store.resolve(bob, owned.id)).toBeNull();
  });
  it("shares one API instance across simultaneous requests", async () => {
    const app = application();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => app.request("/api/projects", { headers: memberHeaders })),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(apiCreations).toBe(1);
  });
});
