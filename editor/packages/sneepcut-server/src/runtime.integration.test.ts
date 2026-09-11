import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { ProjectStore } from "./store";
import { createUserRuntime } from "./runtime";
import { initializeProject, starterHtml } from "./starter";
import { lintHyperframeHtml } from "@hyperframes/lint";

const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const roots: string[] = [];
const runtimes: ReturnType<typeof createUserRuntime>[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

test("new SneepCut composition satisfies the source HTML contract", async () => {
  const result = await lintHyperframeHtml(starterHtml("Synthetic project"));
  expect(result.findings.filter((finding) => finding.severity === "error")).toEqual([]);
  expect(starterHtml('<script>alert("x")</script>')).not.toContain("<script>alert");
});

test("authenticated editor saves, rejects conflicts, reopens and isolates real project APIs", async () => {
  const root = await mkdtemp(join(tmpdir(), "sneepcut-editor-integration-"));
  roots.push(root);
  const store = new ProjectStore(root);
  const app = createApp({
    appOrigin: "http://localhost:3000",
    editorOrigin: "http://localhost:5191",
    authBaseUrl: "http://auth.invalid",
    store,
    initializeProject,
    fetchAuth: async (_url, init) =>
      Response.json({
        user: {
          id: new Headers(init?.headers).get("Authorization") === "Bearer owner" ? owner : stranger,
          access_role: "member",
          deletion_pending: false,
        },
      }),
    createStudioApiForUser(user) {
      const runtime = createUserRuntime(user.id, store);
      runtimes.push(runtime);
      return runtime.api;
    },
  });
  const call = (
    path: string,
    method = "GET",
    body?: string,
    token = "owner",
    extra: Record<string, string> = {},
  ) =>
    app.request(`http://localhost:5191${path}`, {
      method,
      body,
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        ...extra,
      },
    });
  const created = await call(
    "/sneepcut/projects",
    "POST",
    JSON.stringify({ title: "Synthetic project" }),
  );
  expect(created.status).toBe(201);
  const { project } = await created.json();
  const path = `/api/projects/${project.id}/files/index.html`;
  const first = await call(path);
  expect(first.status).toBe(200);
  const original = await first.json();
  const updated = original.content.replace("Your story. Your edit.", "Saved by SneepCut.");
  expect((await call(path, "PUT", updated)).status).toBe(428);
  expect(
    (
      await call(path, "PUT", updated, "owner", {
        "If-Match": original.version,
        "Content-Type": "text/html",
      })
    ).status,
  ).toBe(200);
  expect(
    (await call(path, "PUT", original.content, "owner", { "If-Match": original.version })).status,
  ).toBe(409);
  expect((await (await call(path)).json()).content).toContain("Saved by SneepCut.");
  expect((await call(path, "GET", undefined, "stranger")).status).toBe(404);
  const missingRender = await call("/api/render/unknown/download");
  expect(missingRender.status).toBe(404);
  expect(await missingRender.json()).toEqual({ error: "not found" });
  // The assistant's small prompt limit must not cap the editor's media uploads.
  expect((await call("/api/unknown", "POST", "x".repeat(3_200_000))).status).toBe(404);
  expect(await new ProjectStore(root).resolve(owner, project.id)).toMatchObject({
    title: "Synthetic project",
  });
  const preview = await call(`/api/projects/${project.id}/preview`);
  expect(preview.status).toBe(200);
  const html = await preview.text();
  expect(html).toContain("Saved by SneepCut.");
  expect(html).not.toContain("https://cdn.jsdelivr.net/npm/gsap@");
  expect(html).toContain("/api/runtime.js");
  expect(html).toContain("data-sneepcut-motion-path");
}, 120000);
