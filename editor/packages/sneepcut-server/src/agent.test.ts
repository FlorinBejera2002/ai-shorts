import { afterEach, expect, test } from "bun:test";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { findFfBinary } from "../../parsers/src/ffBinaries";
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
  const scratch = join(import.meta.dir, "../../../../.cache/tmp");
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "studio-agent-test-"));
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

test("Studio layer operations preserve versions, replay once and support Undo", async () => {
  const { call, store } = await fixture();
  const created = await (await call("studio.create", { title: "Layer fixture" })).json();
  const edited = await call("studio.edit", {
    id: created.id,
    expected_version: created.version,
    element_id: "subtitle",
    changes: { x: 20, y: 40, width: 900, font_family: "Arial", text_align: "center", rotation: 5 },
  });
  expect(edited.status).toBe(200);
  const edit = await edited.json();
  const project = await store.resolve(owner, created.id);
  if (!project) throw new Error("Missing project");
  expect(await readFile(join(project.dir, "index.html"), "utf8")).toContain("left: 20px");
  const removeID = randomUUID();
  const input = { id: created.id, expected_version: edit.version, element_id: "subtitle" };
  const removed = await call("studio.layer.remove", input, removeID);
  expect(removed.status).toBe(200);
  const removedResult = await removed.json();
  expect((await call("studio.layer.remove", input, removeID)).status).toBe(200);
  expect(await readFile(join(project.dir, "index.html"), "utf8")).not.toContain('id="subtitle"');
  const restored = await call("studio.restore", removedResult.undo);
  expect(restored.status).toBe(200);
  const restoredResult = await restored.json();
  const split = await call("studio.layer.split", {
    id: created.id,
    expected_version: restoredResult.version,
    element_id: "title-card",
    split_time: 3,
  });
  expect(split.status).toBe(200);
  const splitResult = await split.json();
  expect(
    splitResult.layers.filter((layer: { duration: string }) => layer.duration === "3"),
  ).toHaveLength(2);
  expect(
    (
      await call(
        "studio.layer.remove",
        { ...input, expected_version: splitResult.version },
        randomUUID(),
        stranger,
      )
    ).status,
  ).toBe(404);
});

test("Studio asset discovery, copies and deletion bind exact owned file content", async () => {
  const { call, store } = await fixture();
  const created = await (await call("studio.create", { title: "Asset fixture" })).json();
  const project = await store.resolve(owner, created.id);
  if (!project) throw new Error("Missing project");
  await writeFile(join(project.dir, "fixture.png"), "synthetic asset version one");
  const listed = await (await call("studio.assets.list", { id: created.id })).json();
  expect(listed.assets).toHaveLength(1);
  expect(JSON.stringify(listed)).not.toContain(project.dir);
  const assetID = listed.assets[0].asset_id;
  const inspected = await (
    await call("studio.assets.get", { id: created.id, asset_id: assetID })
  ).json();
  expect(inspected.references_complete).toBe(false);
  expect(inspected.reference_warning).toContain("Stylesheets");
  const input = {
    id: created.id,
    asset_id: assetID,
    expected_version: created.version,
    expected_asset_version: inspected.asset.expected_asset_version,
  };
  const copyID = randomUUID();
  const copy = await call("studio.assets.duplicate", input, copyID);
  expect(copy.status).toBe(200);
  expect((await call("studio.assets.duplicate", input, copyID)).status).toBe(200);
  expect((await (await call("studio.assets.list", { id: created.id })).json()).assets).toHaveLength(
    2,
  );
  expect(
    (await call("studio.assets.get", { id: created.id, asset_id: assetID }, randomUUID(), stranger))
      .status,
  ).toBe(404);
  expect((await call("studio.assets.delete", { ...input, asset_id: "../index.html" })).status).toBe(
    404,
  );
  await writeFile(join(project.dir, "fixture.png"), "newer manual asset version");
  expect((await call("studio.assets.delete", input)).status).toBe(409);
  expect(await readFile(join(project.dir, "fixture.png"), "utf8")).toBe(
    "newer manual asset version",
  );
  const fresh = await (
    await call("studio.assets.get", { id: created.id, asset_id: assetID })
  ).json();
  const deleteID = randomUUID();
  const deletion = { ...input, expected_asset_version: fresh.asset.expected_asset_version };
  expect((await call("studio.assets.delete", deletion, deleteID)).status).toBe(200);
  expect((await call("studio.assets.delete", deletion, deleteID)).status).toBe(200);
  expect((await (await call("studio.assets.list", { id: created.id })).json()).assets).toHaveLength(
    1,
  );
});

test("Studio asset pages do not hide late assets or invalidate successful copies", async () => {
  const { call, store } = await fixture();
  const creation = await call("studio.create", { title: "Large asset fixture" });
  const created = await creation.json();
  if (creation.status !== 200)
    throw new Error(
      `Studio fixture creation failed: ${creation.status} ${JSON.stringify(created)}`,
    );
  const project = await store.resolve(owner, created.id);
  if (!project) throw new Error("Missing project");
  await Promise.all(
    Array.from({ length: 201 }, (_, index) =>
      writeFile(
        join(project.dir, `asset-${String(index).padStart(3, "0")}.png`),
        "synthetic asset",
      ),
    ),
  );
  const first = await (await call("studio.assets.list", { id: created.id })).json();
  expect(first.assets).toHaveLength(200);
  expect(first.has_more).toBe(true);
  const second = await (await call("studio.assets.list", { id: created.id, page: 2 })).json();
  expect(second.assets).toHaveLength(1);
  expect(second.has_more).toBe(false);
  const inspected = await (
    await call("studio.assets.get", { id: created.id, asset_id: second.assets[0].asset_id })
  ).json();
  const copied = await call("studio.assets.duplicate", {
    id: created.id,
    asset_id: second.assets[0].asset_id,
    expected_version: inspected.version,
    expected_asset_version: inspected.asset.expected_asset_version,
  });
  expect(copied.status).toBe(200);
  const copy = await copied.json();
  expect(
    (await call("studio.assets.get", { id: created.id, asset_id: copy.asset.asset_id })).status,
  ).toBe(200);
  expect(
    (await (await call("studio.assets.list", { id: created.id, page: 2 })).json()).assets,
  ).toHaveLength(2);
}, 30000);

test("Studio asset rename preserves media and updates references with guarded replay", async () => {
  const { call, store } = await fixture();
  const created = await (await call("studio.create", { title: "Rename fixture" })).json();
  const project = await store.resolve(owner, created.id);
  if (!project) throw new Error("Missing project");
  await writeFile(join(project.dir, "fixture.png"), "synthetic image bytes");
  const html = (await readFile(join(project.dir, "index.html"), "utf8")).replace(
    "</body>",
    '<img id="photo" src="fixture.png" /></body>',
  );
  await writeFile(join(project.dir, "index.html"), html);
  const listed = await (await call("studio.assets.list", { id: created.id })).json();
  const asset = await (
    await call("studio.assets.get", { id: created.id, asset_id: listed.assets[0].asset_id })
  ).json();
  const input = {
    id: created.id,
    asset_id: asset.asset.asset_id,
    expected_version: asset.version,
    expected_asset_version: asset.asset.expected_asset_version,
    new_name: "renamed.png",
  };
  expect((await call("studio.assets.rename", { ...input, new_name: "../escape.png" })).status).toBe(
    422,
  );
  expect((await call("studio.assets.rename", { ...input, new_name: "unsafe.html" })).status).toBe(
    422,
  );
  expect(
    (await call("studio.assets.rename", { ...input, expected_version: created.version })).status,
  ).toBe(409);
  expect((await call("studio.assets.rename", input, randomUUID(), stranger)).status).toBe(404);
  const request = randomUUID();
  const renamed = await call("studio.assets.rename", input, request);
  expect(renamed.status).toBe(200);
  const result = await renamed.json();
  expect(result.asset.name).toBe("renamed.png");
  expect((await call("studio.assets.rename", input, request)).status).toBe(200);
  expect(await readFile(join(project.dir, "renamed.png"), "utf8")).toBe("synthetic image bytes");
  expect(await readFile(join(project.dir, "index.html"), "utf8")).toContain('src="renamed.png"');
  expect(
    (await call("studio.assets.get", { id: created.id, asset_id: input.asset_id })).status,
  ).toBe(404);
  expect(
    (await call("studio.assets.get", { id: created.id, asset_id: result.asset.asset_id })).status,
  ).toBe(200);
});

test("Studio saved renders are decoded before export and delete only the chosen output", async () => {
  const ffmpeg = findFfBinary("ffmpeg", { configuredMustExist: true });
  if (!ffmpeg) throw new Error("FFmpeg is required for verified Studio export integration");
  const { call, store } = await fixture();
  const created = await (await call("studio.create", { title: "Render fixture" })).json();
  const project = await store.resolve(owner, created.id);
  if (!project) throw new Error("Missing project");
  const renders = join(project.dir, "renders");
  await mkdir(renders);
  const jobID = `${created.id}_2026-10-13_12-30-00_${randomUUID()}`;
  const filename = `${jobID}.mp4`;
  execFileSync(
    ffmpeg,
    [
      "-nostdin",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=64x64:d=0.2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      join(renders, filename),
    ],
    { windowsHide: true },
  );
  await writeFile(
    join(renders, `${jobID}.state.json`),
    JSON.stringify({ id: jobID, filename, status: "complete", progress: 100 }),
  );
  const listed = await (await call("studio.renders.list", { id: created.id })).json();
  expect(listed.renders).toHaveLength(1);
  expect(listed.renders[0].status).toBe("complete");
  const exported = await call("studio.export", { id: created.id, job_id: jobID });
  expect(exported.status).toBe(200);
  expect((await exported.json()).verified).toBe(true);
  expect(
    (await call("studio.export", { id: created.id, job_id: jobID }, randomUUID(), stranger)).status,
  ).toBe(404);
  const deletionID = randomUUID();
  expect(
    (await call("studio.renders.delete", { id: created.id, job_id: jobID }, deletionID)).status,
  ).toBe(200);
  expect(
    (await call("studio.renders.delete", { id: created.id, job_id: jobID }, deletionID)).status,
  ).toBe(200);
  expect(
    (await (await call("studio.renders.list", { id: created.id })).json()).renders,
  ).toHaveLength(0);
  expect((await call("studio.export", { id: created.id, job_id: jobID })).status).toBe(404);
  expect(await readFile(join(project.dir, "index.html"), "utf8")).toContain("Render fixture");
  const activeID = `${created.id}_2026-10-13_12-30-01_${randomUUID()}`;
  await writeFile(join(renders, `${activeID}.mp4`), "partial output");
  await writeFile(
    join(renders, `${activeID}.state.json`),
    JSON.stringify({
      id: activeID,
      filename: `${activeID}.mp4`,
      status: "rendering",
      progress: 10,
    }),
  );
  expect((await call("studio.renders.delete", { id: created.id, job_id: activeID })).status).toBe(
    409,
  );
  expect(await readFile(join(renders, `${activeID}.mp4`), "utf8")).toBe("partial output");
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
  await writeFile(join(assetProject!.dir, "fixture.mp3"), "synthetic inventory fixture");
  const inspected = await (await call("studio.get", { id: createID }, randomUUID())).json();
  expect(inspected.assets).toContain("fixture.mp3");
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
