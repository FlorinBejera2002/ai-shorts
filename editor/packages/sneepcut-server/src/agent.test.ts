import { afterEach, expect, test } from "bun:test";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { ProjectStore } from "./store";
import { createUserRuntime } from "./runtime";
import { initializeProject } from "./starter";
import { verifyAgentGrant } from "./agent-auth";

const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const secret = "synthetic-studio-agent-secret-32-bytes-minimum";
const roots: string[] = [];
const runtimes: ReturnType<typeof createUserRuntime>[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function grant(raw: string, user = owner, expiry = Math.floor(Date.now() / 1000) + 30) {
  const hash = createHash("sha256").update(raw).digest("hex");
  return `${user}:${expiry}:${createHmac("sha256", secret).update(`${user}\n${expiry}\n${hash}`).digest("hex")}`;
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "studio-agent-test-"));
  roots.push(root);
  const store = new ProjectStore(root);
  const app = createApp({
    appOrigin: "http://localhost:3000",
    editorOrigin: "http://localhost:5191",
    authBaseUrl: "http://unused.invalid",
    store,
    agentSecret: secret,
    initializeProject,
    createStudioApiForUser(user) {
      const runtime = createUserRuntime(user.id, store);
      runtimes.push(runtime);
      return runtime.api;
    },
  });
  const call = (name: string, input: unknown, requestID = randomUUID(), user = owner) => {
    const raw = JSON.stringify({ name, input, request_id: requestID });
    return app.request("http://studio-internal:5191/sneepcut/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Studio-Agent-Grant": grant(raw, user) },
      body: raw,
    });
  };
  return { app, store, call };
}
test("Studio grants expire and bind identity and exact request bytes", () => {
  const raw = '{"name":"studio.list"}';
  expect(verifyAgentGrant(raw, grant(raw), secret)).toBe(owner);
  expect(verifyAgentGrant(raw + " ", grant(raw), secret)).toBeNull();
  expect(
    verifyAgentGrant(raw, grant(raw, owner, Math.floor(Date.now() / 1000) - 1), secret),
  ).toBeNull();
  expect(verifyAgentGrant(raw, grant(raw).replace(owner, stranger), secret)).toBeNull();
  expect(verifyAgentGrant(raw, grant(raw), "short")).toBeNull();
});
test("Studio bridge creates, edits with CAS, replays receipts and isolates owners", async () => {
  const { call, store } = await fixture();
  const createID = randomUUID();
  const created = await call("studio.create", { title: "Synthetic title" }, createID);
  expect(created.status).toBe(200);
  const project = await created.json();
  expect(project.id).toBe(createID);
  expect(project.version).toMatch(/^"sha256:/);
  expect(JSON.stringify(project)).not.toContain("/tmp/");
  const assetProject = await store.resolve(owner, createID);
  await writeFile(join(assetProject!.dir, 'fixture.mp3'), 'synthetic inventory fixture');
  const inspected = await (await call('studio.get', { id: createID }, randomUUID())).json();
  expect(inspected.assets).toContain('fixture.mp3');
  expect(JSON.stringify(inspected)).not.toContain(assetProject!.dir);
  const edited = await call(
    "studio.edit",
    {
      id: createID,
      expected_version: project.version,
      element_id: "subtitle",
      changes: { text: "Actually changed", color: "#123456" },
    },
    "33333333-3333-4333-8333-333333333333",
  );
  expect(edited.status).toBe(200);
  const result = await edited.json();
  expect(result.version).not.toBe(project.version);
  const actual = await store.resolve(owner, createID);
  expect(actual).not.toBeNull();
  if (!actual) throw new Error("Missing project");
  expect(await readFile(join(actual.dir, "index.html"), "utf8")).toContain("Actually changed");
  const replay = await call(
    "studio.edit",
    {
      id: createID,
      expected_version: project.version,
      element_id: "subtitle",
      changes: { text: "Actually changed", color: "#123456" },
    },
    "33333333-3333-4333-8333-333333333333",
  );
  expect(replay.status).toBe(200);
  expect((await replay.json()).version).toBe(result.version);
  const restored = await call("studio.restore", result.undo);
  expect(restored.status).toBe(200);
  expect(await readFile(join(actual.dir, "index.html"), "utf8")).not.toContain("Actually changed");
  const restoredResult = await restored.json();
  const redone = await call("studio.restore", restoredResult.undo);
  expect(redone.status).toBe(200);
  expect(
    (
      await call("studio.edit", {
        id: createID,
        expected_version: project.version,
        element_id: "subtitle",
        changes: { text: "Stale edit" },
      })
    ).status,
  ).toBe(409);
  expect((await call("studio.get", { id: createID }, randomUUID(), stranger)).status).toBe(404);
  expect(
    (
      await call("studio.edit", {
        id: createID,
        expected_version: result.version,
        element_id: "subtitle",
        changes: { src: "https://evil.invalid" },
      })
    ).status,
  ).toBe(422);
  const manuallyChanged = (await readFile(join(actual.dir, "index.html"), "utf8")).replace(
    "Actually changed",
    "Manual edit",
  );
  await writeFile(join(actual.dir, "index.html"), manuallyChanged);
  expect(
    (
      await call("studio.edit", {
        id: createID,
        expected_version: result.version,
        element_id: "subtitle",
        changes: { text: "Overwrite" },
      })
    ).status,
  ).toBe(409);
  expect(await readFile(join(actual.dir, "index.html"), "utf8")).toContain("Manual edit");
});
test("Studio bridge rejects browser use, arbitrary actions and unsigned requests", async () => {
  const { app, call } = await fixture();
  expect((await app.request("/sneepcut/agent", { method: "POST", body: "{}" })).status).toBe(401);
  const raw = JSON.stringify({ name: "studio.list", input: {}, request_id: randomUUID() });
  expect(
    (
      await app.request("/sneepcut/agent", {
        method: "POST",
        body: raw,
        headers: { Origin: "http://localhost:3000", "X-Studio-Agent-Grant": grant(raw) },
      })
    ).status,
  ).toBe(403);
  expect((await call("studio.list", { url: "http://internal.invalid" })).status).toBe(422);
});
