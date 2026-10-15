import { afterEach, beforeEach, expect, test, setDefaultTimeout } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RenderJobState } from "@hyperframes/studio-server";
import { createCompositionService } from "./composition-service";
import { CompositionStore } from "./composition-store";
import { createClipImporter, stableProjectId } from "./clip-import";
import { ProjectStore } from "./store";
import type { startSandboxRender } from "./sandbox";
import { workspaceRevision, withWorkspace, trackWorkspaceWrite } from "./workspace";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const artifact = "33333333-3333-4333-8333-333333333333";
const derived = "44444444-4444-4444-8444-444444444444";
const clipID = "55555555-5555-4555-8555-555555555555";
const secret = "synthetic-composition-service-secret-32";
const now = 1_760_000_000_000;
setDefaultTimeout(90_000);
let root: string;
let store: CompositionStore;
let downloads: string[];
let renderCalls: Parameters<typeof startSandboxRender>[0][];
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "studio-composition-test-"));
  store = new CompositionStore(join(root, "generated"));
  downloads = [];
  renderCalls = [];
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const plan = () => ({
  schema_version: 1,
  title: "Generated edit",
  width: 1920,
  height: 1080,
  duration: 4,
  dynamic_range: "sdr",
  assets: [
    {
      id: "source",
      kind: "video",
      name: "Camera.mp4",
      url: "/media/upload/source.mp4?sig=first",
      duration: 10,
      width: 1920,
      height: 1080,
      has_audio: true,
    },
  ],
  scenes: [{ id: "scene", asset_id: "source", start: 0, duration: 4, source_in: 2 }],
  audio: [
    { id: "voice", asset_id: "source", start: 0, duration: 4, source_in: 2, scene_id: "scene" },
  ],
  overlays: [
    {
      id: "caption",
      text: "Keep this layer",
      x: 10,
      y: 20,
      width: 600,
      height: 100,
      start: 1,
      duration: 2,
    },
  ],
});
const render: typeof startSandboxRender = (options) => {
  renderCalls.push(options);
  const state: RenderJobState = {
    id: options.jobId,
    status: "rendering",
    progress: 0,
    outputPath: options.outputPath,
    cancel() {
      state.status = "cancelled";
    },
  };
  const settled = (async () => {
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, `rendered:${options.hdrMode}`);
    if (state.status === "rendering") {
      state.status = "complete";
      state.progress = 100;
    }
  })();
  return Object.assign(state, {
    settled,
    cancel() {
      state.status = "cancelled";
    },
  });
};
function service(overrides: Partial<Parameters<typeof createCompositionService>[0]> = {}) {
  return createCompositionService({
    store,
    secret,
    mediaOrigin: "https://app.test",
    mediaFetchOrigin: "http://nginx",
    now: () => now,
    pollMilliseconds: 1,
    render,
    fetcher: async (url, init) => {
      downloads.push(String(url));
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      expect(init?.redirect).toBe("error");
      return new Response("full-quality-original");
    },
    ...overrides,
  });
}
type Service = ReturnType<typeof service>;
function request(
  operation: string,
  input: unknown,
  owner = alice,
  requestID = artifact,
  domain = "composition",
) {
  const body = JSON.stringify({ operation, request_id: requestID, input });
  const expiry = String(Math.floor(now / 1000) + 30);
  const hash = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", secret)
    .update(`${domain}\n${owner}\n${expiry}\n${hash}`)
    .digest("hex");
  return new Request("http://studio/sneepcut/composition", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Studio-Composition-Grant": `${owner}:${expiry}:${signature}`,
    },
  });
}
async function complete(api: Service, id = artifact) {
  let latest: unknown;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await (await api(request("composition.status", { artifact_id: id }))).json();
    latest = result;
    if (result.status === "failed") throw new Error(`Composition failed: ${result.error}`);
    if (result.status === "complete" || result.status === "cancelled") return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Render did not finish: ${JSON.stringify(latest)}`);
}

test("composition grants bind owner, body and domain and reject browser origins", async () => {
  const api = service();
  expect(
    (await api(request("composition.render", { plan: plan() }, alice, artifact, "agent"))).status,
  ).toBe(401);
  const changed = request("composition.render", { plan: plan() });
  expect(
    (await api(new Request(changed, { body: JSON.stringify({ different: true }) }))).status,
  ).toBe(401);
  const browser = request("composition.render", { plan: plan() });
  browser.headers.set("Origin", "https://app.test");
  expect((await api(browser)).status).toBe(403);
  expect(
    (await api(new Request("http://studio/sneepcut/composition", { method: "POST", body: "{}" })))
      .status,
  ).toBe(401);
  expect(
    (await service({ now: () => now + 120_000 })(request("composition.render", { plan: plan() })))
      .status,
  ).toBe(401);
  expect(downloads).toHaveLength(0);
});

test("staged regeneration preserves saved files and publishes one stable workspace with CAS", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const api = service({ editableStore: editable });
  await api(request("composition.render", { plan: plan(), project_id: clipID }));
  await complete(api);
  const initial = await api(request("composition.commit", { artifact_id: artifact }));
  expect(initial.status).toBe(200);
  expect((await initial.json()).committed_revision).toMatch(/^sha256:/);
  const workspace = (await editable.resolve(alice, clipID))!;
  const html = (await readFile(join(workspace.dir, "index.html"), "utf8")).replace(
    "Keep this layer",
    "Manual title",
  );
  await writeFile(join(workspace.dir, "index.html"), html);
  await mkdir(join(workspace.dir, ".hyperframes"));
  await writeFile(join(workspace.dir, ".hyperframes", "manual-edits.json"), '{"custom":true}');
  await writeFile(join(workspace.dir, "manual.txt"), "Saved custom file");
  const manualRevision = await workspaceRevision(workspace.dir);
  const next = plan();
  next.overlays.push({ ...next.overlays[0], id: "new-auto-layer", text: "New generated layer" });
  expect(
    (
      await api(
        request("composition.render", { plan: next, base_artifact_id: artifact }, alice, derived),
      )
    ).status,
  ).toBe(202);
  const rendered = await complete(api, derived);
  expect(rendered.project_id).toBe(clipID);
  expect(rendered.effective_timeline.manually_edited).toBe(true);
  expect(await workspaceRevision((await editable.resolve(alice, clipID))!.dir)).toBe(
    manualRevision,
  );
  expect((await api(request("composition.commit", { artifact_id: derived }))).status).toBe(200);
  const published = (await editable.resolve(alice, clipID))!;
  expect(published.dir).not.toBe(workspace.dir);
  const saved = await readFile(join(published.dir, "index.html"), "utf8");
  expect(saved).toContain("Manual title");
  expect(saved).toContain("New generated layer");
  expect(await readFile(join(published.dir, "manual.txt"), "utf8")).toBe("Saved custom file");
  expect(await readFile(join(published.dir, ".hyperframes", "manual-edits.json"), "utf8")).toBe(
    '{"custom":true}',
  );
  const opened = await store.importProject(alice, artifact, editable, artifact, "Old output");
  expect(opened.id).toBe(clipID);
  expect(opened.dir).toBe(published.dir);
  expect((await api(request("composition.commit", { artifact_id: derived }))).status).toBe(200);
  await writeFile(join(published.dir, "manual.txt"), "Later manual save");
  expect((await api(request("composition.commit", { artifact_id: derived }))).status).toBe(409);
  expect((await api(request("composition.commit", { artifact_id: derived }, bob))).status).toBe(
    404,
  );
  await api(request("composition.delete", { artifact_ids: [artifact] }));
  expect(await editable.resolve(alice, clipID)).not.toBeNull();
});

test("concurrent saved edits reject commit and restart retries keep the captured source", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const api = service({ editableStore: editable });
  await api(request("composition.render", { plan: plan() }));
  await complete(api);
  await api(request("composition.commit", { artifact_id: artifact }));
  const next = plan();
  next.title = "Candidate";
  await api(
    request("composition.render", { plan: next, base_artifact_id: artifact }, alice, derived),
  );
  await complete(api, derived);
  const workspace = (await editable.resolve(alice, artifact))!;
  await writeFile(join(workspace.dir, "new-file.txt"), "Concurrent saved edit");
  expect((await api(request("composition.commit", { artifact_id: derived }))).status).toBe(409);
  const restarted = service({ editableStore: editable });
  const retry = await restarted(
    request("composition.render", { plan: next, base_artifact_id: artifact }, alice, derived),
  );
  expect(retry.status).toBe(202);
  expect((await restarted(request("composition.commit", { artifact_id: derived }))).status).toBe(
    409,
  );
  expect(await readFile(join(workspace.dir, "new-file.txt"), "utf8")).toBe("Concurrent saved edit");
});

test("export variants inherit primary manual content without replacing or deleting its workspace", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const api = service({ editableStore: editable });
  const primary = plan();
  primary.overlays.push({ ...primary.overlays[0], id: "platform-badge", text: "Badge" });
  await api(request("composition.render", { plan: primary }));
  await complete(api);
  await api(request("composition.commit", { artifact_id: artifact }));
  const workspace = (await editable.resolve(alice, artifact))!;
  await writeFile(join(workspace.dir, "custom.txt"), "Manual asset");
  await api(
    request(
      "composition.derive",
      { base_artifact_id: artifact, trim: { start: 0, end: 4 }, expected_duration: 4 },
      alice,
      derived,
    ),
  );
  await complete(api, derived);
  const exportID = "66666666-6666-4666-8666-666666666666";
  await api(
    request(
      "composition.derive",
      {
        base_artifact_id: derived,
        trim: { start: 0, end: 4 },
        export_only: true,
        remove_platform_badge: true,
      },
      alice,
      exportID,
    ),
  );
  const variant = await complete(api, exportID);
  expect(variant.project_id).toBe(artifact);
  const output = await store.completed(alice, exportID);
  expect(await readFile(join(output.dir, "custom.txt"), "utf8")).toBe("Manual asset");
  expect((await api(request("composition.commit", { artifact_id: exportID }))).status).toBe(409);
  await api(request("composition.delete", { artifact_ids: [exportID] }));
  expect(await editable.resolve(alice, artifact)).not.toBeNull();
  expect(
    (
      await api(
        request(
          "composition.derive",
          { base_artifact_id: artifact, trim: { start: 0, end: 2 }, expected_duration: 3 },
          alice,
          exportID,
        ),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await api(
        request(
          "composition.derive",
          { base_artifact_id: artifact, trim: { start: 0, end: 2 }, expected_duration: 3 },
          alice,
          clipID,
        ),
      )
    ).status,
  ).toBe(409);
});

test("a fresh worker attempt recovers its scoped committed project and preserves manual saves", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const projectID = stableProjectId("initial-job-retry");
  const api = service({ editableStore: editable });
  await api(
    request("composition.render", { plan: plan(), project_id: projectID, scope_id: clipID }),
  );
  await complete(api);
  expect((await api(request("composition.commit", { artifact_id: artifact }))).status).toBe(200);
  const original = (await editable.resolve(alice, projectID))!;
  const manual = (await readFile(join(original.dir, "index.html"), "utf8")).replace(
    "Keep this layer",
    "Manual title after commit",
  );
  await writeFile(join(original.dir, "index.html"), manual);
  await writeFile(join(original.dir, "manual.txt"), "Keep saved file");
  const before = await workspaceRevision(original.dir);
  const next = plan();
  next.overlays.push({ ...next.overlays[0]!, id: "fresh-auto-layer", text: "New automatic layer" });
  const started = await api(
    request(
      "composition.render",
      { plan: next, project_id: projectID, scope_id: clipID },
      alice,
      derived,
    ),
  );
  expect(started.status).toBe(202);
  const retried = await complete(api, derived);
  expect(retried.project_id).toBe(projectID);
  expect(retried.base_artifact_id).toBe(artifact);
  expect(retried.baseline_artifact_id).toBe(artifact);
  expect(retried.manually_edited).toBe(true);
  expect(await workspaceRevision(original.dir)).toBe(before);
  const candidate = await store.completed(alice, derived);
  expect(await readFile(join(candidate.dir, "index.html"), "utf8")).toContain(
    "Manual title after commit",
  );
  expect(await readFile(join(candidate.dir, "index.html"), "utf8")).toContain(
    "New automatic layer",
  );
  expect(await readFile(join(candidate.dir, "manual.txt"), "utf8")).toBe("Keep saved file");
  expect((await api(request("composition.commit", { artifact_id: derived }))).status).toBe(200);
  expect(await store.workspaceHead(alice, projectID)).toBe(derived);
  const published = (await editable.resolve(alice, projectID))!;
  expect(await readFile(join(published.dir, "index.html"), "utf8")).toContain(
    "Manual title after commit",
  );
});

test("initial retry cannot adopt another scope, an uncommitted import, or a missing canonical baseline", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const projectID = stableProjectId("retry-scope-boundary");
  const api = service({ editableStore: editable });
  await api(
    request("composition.render", { plan: plan(), project_id: projectID, scope_id: clipID }),
  );
  await complete(api);
  await store.importProject(alice, artifact, editable, projectID, "Uncommitted import");
  const retry = (scope: string | undefined = clipID) =>
    api(
      request(
        "composition.render",
        { plan: plan(), project_id: projectID, scope_id: scope },
        alice,
        derived,
      ),
    );
  expect((await retry()).status).toBe(409);
  expect(await store.read(alice, derived)).toBeNull();
  // The imported snapshot is exact, so its accepted publication journal can be
  // completed without manufacturing unrelated lineage for the initial retry.
  const saved = (await store.read(alice, artifact))!;
  const workspace = (await editable.resolve(alice, projectID))!;
  saved.publishing_revision = await workspaceRevision(workspace.dir);
  await store.write(alice, saved);
  expect((await api(request("composition.commit", { artifact_id: artifact }))).status).toBe(200);
  const before = await workspaceRevision(workspace.dir);
  expect((await retry(bob)).status).toBe(409);
  expect(
    (
      await api(
        request("composition.render", { plan: plan(), project_id: projectID }, alice, derived),
      )
    ).status,
  ).toBe(409);
  await store.baselines.remove(alice, artifact);
  expect((await retry()).status).toBe(409);
  expect(await workspaceRevision(workspace.dir)).toBe(before);
  expect(downloads).toHaveLength(1);
});

test("initial retry repairs an exact publication journal and rejects an unmatched pending publication", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const projectID = stableProjectId("retry-publication-journal");
  const api = service({ editableStore: editable });
  await api(
    request("composition.render", { plan: plan(), project_id: projectID, scope_id: clipID }),
  );
  await complete(api);
  const publish = editable.publish.bind(editable);
  editable.publish = async (...args) => {
    const result = await publish(...args);
    throw new Error(`Interrupted after publishing ${result.id}`);
  };
  expect((await api(request("composition.commit", { artifact_id: artifact }))).status).toBe(500);
  const restarted = service({ editableStore: editable });
  const next = { ...plan(), title: "New worker attempt" };
  expect(
    (
      await restarted(
        request(
          "composition.render",
          { plan: next, project_id: projectID, scope_id: clipID },
          alice,
          derived,
        ),
      )
    ).status,
  ).toBe(202);
  await complete(restarted, derived);
  expect((await store.read(alice, artifact))!.committed_revision).toBeTruthy();
  expect((await store.read(alice, artifact))!.publishing_revision).toBeUndefined();
  expect((await restarted(request("composition.commit", { artifact_id: derived }))).status).toBe(
    500,
  );
  const published = (await editable.resolve(alice, projectID))!;
  await writeFile(join(published.dir, "manual.txt"), "Saved after interrupted publication");
  const before = await workspaceRevision(published.dir);
  const retryID = stableProjectId("third-worker-attempt");
  const rejected = await restarted(
    request(
      "composition.render",
      { plan: next, project_id: projectID, scope_id: clipID },
      alice,
      retryID,
    ),
  );
  expect(rejected.status).toBe(409);
  expect((await rejected.json()).error).toContain("interrupted publication");
  expect(await store.workspaceHead(alice, projectID)).toBe(artifact);
  expect(await store.read(alice, retryID)).toBeNull();
  expect(await workspaceRevision(published.dir)).toBe(before);
});

test("workspace snapshots wait for background writes and hash nested saved files", async () => {
  const directory = join(root, "workspace");
  await mkdir(directory);
  await writeFile(join(directory, "index.html"), "Root");
  let finish = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  trackWorkspaceWrite(alice, artifact, pending);
  let captured = false;
  const snapshot = withWorkspace(alice, artifact, async () => {
    captured = true;
    return workspaceRevision(directory);
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(captured).toBe(false);
  await writeFile(join(directory, "nested.html"), "Saved nested scene");
  finish();
  const before = await snapshot;
  await writeFile(join(directory, "nested.html"), "Modified nested scene");
  expect(await workspaceRevision(directory)).not.toBe(before);
  await mkdir(join(directory, "renders"));
  const changed = await workspaceRevision(directory);
  await writeFile(join(directory, "renders", "output.mp4"), "Render cache");
  expect(await workspaceRevision(directory)).toBe(changed);
});

test("commit recovers a published head after interruption before receipt confirmation", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const api = service({ editableStore: editable });
  await api(request("composition.render", { plan: plan() }));
  await complete(api);
  const publish = editable.publish.bind(editable);
  let interrupted = false;
  editable.publish = async (...args) => {
    const result = await publish(...args);
    if (!interrupted) {
      interrupted = true;
      throw new Error("Simulated interruption after head publication");
    }
    return result;
  };
  expect((await api(request("composition.commit", { artifact_id: artifact }))).status).toBe(500);
  const published = (await editable.resolve(alice, artifact))!;
  const revision = await workspaceRevision(published.dir);
  expect((await store.read(alice, artifact))!.publishing_revision).toBe(revision);
  const restarted = service({ editableStore: editable });
  await restarted(
    request(
      "composition.render",
      { plan: { ...plan(), title: "Next operation" }, base_artifact_id: artifact },
      alice,
      derived,
    ),
  );
  expect((await complete(restarted, derived)).project_id).toBe(artifact);
  expect((await store.read(alice, artifact))!.committed_revision).toBe(revision);
  const confirmed = await restarted(request("composition.commit", { artifact_id: artifact }));
  expect(confirmed.status).toBe(200);
  expect((await confirmed.json()).committed_revision).toBe(revision);
  expect((await editable.resolve(alice, artifact))!.dir).toBe(published.dir);
});

test("legacy saved workspaces block lossy migration and native legacy imports preserve their ID", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const legacy = await editable.ensure(
    alice,
    stableProjectId(`clip:${clipID}`),
    "Legacy",
    async (project) => {
      await writeFile(join(project.dir, "index.html"), "Hand-edited old document");
    },
  );
  const api = service({ editableStore: editable });
  const rejected = await api(
    request("composition.render", { plan: plan(), source_clip_id: clipID }),
  );
  expect(rejected.status).toBe(409);
  expect((await rejected.json()).code).toBe("legacy_project_requires_studio");
  expect(downloads).toHaveLength(0);
  expect(await readFile(join(legacy.dir, "index.html"), "utf8")).toBe("Hand-edited old document");
  await api(request("composition.render", { plan: plan() }));
  await complete(api);
  const receipt = (await store.read(alice, artifact))!;
  delete receipt.project_id;
  await store.write(alice, receipt);
  const oldCopyID = stableProjectId(`composition-v1:${clipID}:${artifact}`);
  const copy = await store.importProject(alice, artifact, editable, oldCopyID, "Old native copy");
  await writeFile(join(copy.dir, "manual.txt"), "Keep exact saved copy");
  const requestPlan = { ...plan(), title: "Refresh" };
  await api(
    request(
      "composition.render",
      { plan: requestPlan, base_artifact_id: artifact },
      alice,
      derived,
    ),
  );
  expect((await complete(api, derived)).project_id).toBe(oldCopyID);
  await api(request("composition.commit", { artifact_id: derived }));
  expect(
    await readFile(join((await editable.resolve(alice, oldCopyID))!.dir, "manual.txt"), "utf8"),
  ).toBe("Keep exact saved copy");
});

test("renders persistent canonical sources, renews signed URLs idempotently, and isolates output ownership", async () => {
  const api = service();
  expect((await api(request("composition.render", { plan: plan() }))).status).toBe(202);
  expect((await complete(api)).status).toBe("complete");
  expect(downloads).toEqual(["http://nginx/media/upload/source.mp4?sig=first"]);
  expect(renderCalls).toHaveLength(1);
  expect(renderCalls[0].hdrMode).toBe("force-sdr");
  const original = await store.completed(alice, artifact);
  const sourceFile = (await readdir(join(original.dir, "assets"))).find((name) =>
    name.startsWith("source-"),
  )!;
  expect(await readFile(join(original.dir, "assets", sourceFile), "utf8")).toBe(
    "full-quality-original",
  );
  expect(await readFile(join(original.dir, "index.html"), "utf8")).toContain("Keep this layer");
  const renewed = plan();
  renewed.assets[0].url = "/media/upload/source.mp4?sig=renewed";
  expect((await api(request("composition.render", { plan: renewed }))).status).toBe(202);
  expect(renderCalls).toHaveLength(1);
  expect(downloads).toHaveLength(1);
  expect(
    (await api(request("composition.render", { plan: { ...plan(), title: "Different" } }))).status,
  ).toBe(409);
  const output = await api(request("composition.output", { artifact_id: artifact }));
  expect(output.status).toBe(200);
  expect(await output.text()).toBe("rendered:force-sdr");
  expect((await api(request("composition.output", { artifact_id: artifact }, bob))).status).toBe(
    404,
  );
  const restarted = service();
  expect(
    (await (await restarted(request("composition.status", { artifact_id: artifact }))).json())
      .status,
  ).toBe("complete");
  expect((await restarted(request("composition.output", { artifact_id: artifact }))).status).toBe(
    200,
  );
});

test("owned clip opens the exact generated files once without reconstructing or clobbering edits", async () => {
  const api = service();
  await api(request("composition.render", { plan: plan() }));
  expect((await complete(api)).status).toBe("complete");
  const snapshot = await store.completed(alice, artifact);
  const editable = new ProjectStore(join(root, "editable"));
  let calls = 0;
  const importer = createClipImporter({
    store: editable,
    compositions: store,
    apiOrigin: "https://api.test",
    mediaOrigin: "https://app.test",
    fetcher: async (url) => {
      calls++;
      expect(String(url)).toBe(`https://api.test/api/clips/${clipID}`);
      return Response.json({
        id: clipID,
        user_id: alice,
        title: "Generated edit",
        duration: 4,
        file_url: "https://bucket.storage.test/clips/output.mp4?sig=owned",
        studio_artifact_id: artifact,
      });
    },
  });
  const opened = await importer(alice, "Bearer owner", clipID);
  expect(await readFile(join(opened.dir, "index.html"), "utf8")).toBe(
    await readFile(join(snapshot.dir, "index.html"), "utf8"),
  );
  for (const name of (await readdir(snapshot.dir)).filter((name) => name.endsWith(".html")))
    expect(await readFile(join(opened.dir, name), "utf8")).toBe(
      await readFile(join(snapshot.dir, name), "utf8"),
    );
  await writeFile(join(opened.dir, "index.html"), "manual edit");
  expect((await importer(alice, "Bearer owner", clipID)).id).toBe(opened.id);
  expect(await readFile(join(opened.dir, "index.html"), "utf8")).toBe("manual edit");
  expect(await readFile(join(snapshot.dir, "index.html"), "utf8")).not.toBe("manual edit");
  expect(calls).toBe(2);
  expect(await editable.list(bob)).toHaveLength(0);
});

test("derive wraps exact source files and retains all original layers without downloads", async () => {
  const api = service();
  await api(request("composition.render", { plan: plan() }));
  expect((await complete(api)).status).toBe("complete");
  const original = await store.completed(alice, artifact);
  const html = await readFile(join(original.dir, "index.html"), "utf8");
  expect(
    (
      await api(
        request(
          "composition.derive",
          { base_artifact_id: artifact, trim: { start: 1, end: 3 } },
          alice,
          derived,
        ),
      )
    ).status,
  ).toBe(202);
  const result = await complete(api, derived);
  expect(result.status).toBe("complete");
  expect(result.duration).toBe(2);
  const project = await store.completed(alice, derived);
  expect(await readFile(join(project.dir, `original-composition-${derived}.html`), "utf8")).toBe(
    html,
  );
  const wrapper = await readFile(join(project.dir, "index.html"), "utf8");
  expect(wrapper).toContain('data-playback-start="1"');
  expect(wrapper).toContain('data-duration="2"');
  expect(downloads).toHaveLength(1);
  await api(
    request(
      "composition.derive",
      { base_artifact_id: derived, trim: { start: 0.25, end: 1.75 } },
      alice,
      clipID,
    ),
  );
  expect((await complete(api, clipID)).duration).toBe(1.5);
  const secondTrim = await store.completed(alice, clipID);
  expect(await readFile(join(secondTrim.dir, `original-composition-${clipID}.html`), "utf8")).toBe(
    wrapper,
  );
  expect(await readFile(join(secondTrim.dir, `original-composition-${derived}.html`), "utf8")).toBe(
    html,
  );
  expect(
    (
      await api(
        request(
          "composition.derive",
          { base_artifact_id: artifact, trim: { start: 1, end: 9 } },
          alice,
          clipID,
        ),
      )
    ).status,
  ).toBe(409);
});

test("HDR output and its SDR preview use the same stored composition", async () => {
  const api = service();
  await api(request("composition.render", { plan: { ...plan(), dynamic_range: "hdr" } }));
  const result = await complete(api);
  expect(result.status).toBe("complete");
  expect(result.preview_available).toBe(true);
  expect(renderCalls.map((call) => call.hdrMode)).toEqual(["force-hdr", "force-sdr"]);
  expect(renderCalls[0].project.dir).toBe(renderCalls[1].project.dir);
  expect(
    await (
      await api(request("composition.output", { artifact_id: artifact, variant: "preview" }))
    ).text(),
  ).toBe("rendered:force-sdr");
});

test("rejects unsafe media locations before reserving or fetching a project", async () => {
  const api = service();
  const invalid = plan();
  invalid.assets[0].url = "http://169.254.169.254/media/private";
  expect((await api(request("composition.render", { plan: invalid }))).status).toBe(422);
  expect(await store.read(alice, artifact)).toBeNull();
  expect(downloads).toHaveLength(0);
});

test("interrupted receipts recover as failed and the same plan can safely restart", async () => {
  const recipe = plan();
  const original = service();
  await original(request("composition.render", { plan: recipe }));
  expect((await complete(original)).status).toBe("complete");
  const prior = await store.read(alice, artifact);
  if (!prior) throw new Error("Missing original receipt");
  await store.write(alice, { ...prior, status: "rendering", progress: 31 });
  const api = service();
  const recovered = await (
    await api(request("composition.status", { artifact_id: artifact }))
  ).json();
  expect(recovered.status).toBe("failed");
  expect(recovered.error).toContain("restarted");
  expect((await api(request("composition.output", { artifact_id: artifact }))).status).toBe(409);
  const retry = await api(request("composition.render", { plan: recipe }));
  expect({ status: retry.status, body: await retry.json() }).toMatchObject({ status: 202 });
  expect((await complete(api)).status).toBe("complete");
  expect(renderCalls).toHaveLength(2);
  expect(downloads).toHaveLength(1);
});

test("simultaneous retries reserve one immutable project and start one render", async () => {
  const api = service();
  const responses = await Promise.all([
    api(request("composition.render", { plan: plan() })),
    api(request("composition.render", { plan: plan() })),
  ]);
  expect(responses.map((response) => response.status)).toEqual([202, 202]);
  expect((await complete(api)).status).toBe("complete");
  expect(downloads).toHaveLength(1);
  expect(renderCalls).toHaveLength(1);
});

test("cancels the active renderer and never exposes a cancelled output", async () => {
  let cancelled = false;
  const api = service({
    render: (options) => {
      const state: RenderJobState = {
        id: options.jobId,
        outputPath: options.outputPath,
        status: "rendering",
        progress: 10,
        cancel() {
          cancelled = true;
          state.status = "cancelled";
        },
      };
      renderCalls.push(options);
      return Object.assign(state, {
        settled: Promise.resolve(),
        cancel() {
          cancelled = true;
          state.status = "cancelled";
        },
      });
    },
  });
  await api(request("composition.render", { plan: plan() }));
  const deadline = Date.now() + 10_000;
  while (!renderCalls.length && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  expect(renderCalls).toHaveLength(1);
  await api(request("composition.cancel", { artifact_id: artifact }));
  expect((await complete(api)).status).toBe("cancelled");
  expect(cancelled).toBe(true);
  expect((await api(request("composition.output", { artifact_id: artifact }))).status).toBe(409);
});

test("aggregate media budget fails before publishing a partial snapshot", async () => {
  const api = service({ maxBytes: 16 * 1024 ** 2 + 5 });
  await api(request("composition.render", { plan: plan() }));
  await expect(complete(api)).rejects.toThrow("configured aggregate byte budget");
  expect(await store.snapshots.resolve(alice, artifact)).toBeNull();
  expect(renderCalls).toHaveLength(0);
});

test("trusted S3 sources require an exact configured origin and retain signed queries", async () => {
  const api = service({ mediaS3Origin: "https://bucket.storage.test" });
  const source = plan();
  source.assets[0].url = "https://bucket.storage.test/private/source.mp4?X-Amz-Signature=first";
  expect((await api(request("composition.render", { plan: source }))).status).toBe(202);
  await complete(api);
  expect(downloads).toEqual([source.assets[0].url]);
  source.assets[0].url = "https://bucket.storage.test/private/source.mp4?X-Amz-Signature=renewed";
  expect((await api(request("composition.render", { plan: source }))).status).toBe(202);
  expect(downloads).toHaveLength(1);
  for (const url of [
    "https://other.storage.test/private/source.mp4",
    "https://bucket.storage.test.evil.test/private/source.mp4",
    "https://user@bucket.storage.test/private/source.mp4",
    "https://bucket.storage.test:444/private/source.mp4",
  ]) {
    source.assets[0].url = url;
    expect(
      (await api(request("composition.render", { plan: source }, alice, derived))).status,
    ).toBe(422);
  }
  expect(() => service({ mediaS3Origin: "https://bucket.storage.test/path" })).toThrow(
    "Invalid S3",
  );
});

test("scope deletion removes all versions and edited clones and survives restarts", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const api = service({ editableStore: editable });
  await api(request("composition.render", { plan: plan(), scope_id: clipID }));
  await complete(api);
  await api(
    request(
      "composition.derive",
      { base_artifact_id: artifact, trim: { start: 1, end: 3 } },
      alice,
      derived,
    ),
  );
  await complete(api, derived);
  expect((await store.read(alice, derived))?.scope_id).toBe(clipID);
  const clone = await store.importProject(alice, artifact, editable, artifact, "Editable copy");
  await writeFile(join(clone.dir, "index.html"), "manual changes");
  // Deletion uses trusted origin records even if editable project metadata changes.
  await writeFile(join(clone.dir, ".sneepcut-project.json"), "corrupt metadata");
  const unrelated = await editable.create(alice, "Other project");
  const otherOwner = await editable.create(bob, "Other account");
  // Another owner's signed request cannot delete Alice's same scope.
  expect((await api(request("composition.delete_scope", { scope_id: clipID }, bob))).status).toBe(
    200,
  );
  expect(await store.completed(alice, artifact)).toBeTruthy();
  expect((await api(request("composition.delete_scope", { scope_id: clipID }))).status).toBe(200);
  expect(await editable.resolve(alice, clone.id)).toBeNull();
  expect((await readdir(await editable.userHome(alice))).includes(clone.id)).toBe(false);
  expect(await editable.resolve(alice, unrelated.id)).toBeTruthy();
  expect(await editable.resolve(bob, otherOwner.id)).toBeTruthy();
  expect(await store.snapshots.resolve(alice, artifact)).toBeNull();
  expect(await store.snapshots.resolve(alice, derived)).toBeNull();
  expect((await api(request("composition.output", { artifact_id: artifact }))).status).toBe(404);
  expect((await api(request("composition.delete_scope", { scope_id: clipID }))).status).toBe(200);
  const restarted = service({
    store: new CompositionStore(join(root, "generated")),
    editableStore: editable,
  });
  expect(
    (await restarted(request("composition.render", { plan: plan(), scope_id: clipID }, alice, bob)))
      .status,
  ).toBe(404);
  await expect(
    store.importProject(alice, artifact, editable, artifact, "Deleted copy"),
  ).rejects.toThrow("deleted");
});

test("delete waits for renderer cancellation to settle before removing every output", async () => {
  let stopped = false;
  const api = service({
    render(options) {
      let cancel = () => {};
      const state: RenderJobState = {
        id: options.jobId,
        outputPath: options.outputPath,
        status: "rendering",
        progress: 10,
      };
      const settled = new Promise<void>((resolve) => {
        cancel = () => {
          void (async () => {
            await mkdir(dirname(options.outputPath), { recursive: true });
            await writeFile(options.outputPath, "last write after cancellation");
            state.status = "cancelled";
            stopped = true;
            resolve();
          })();
        };
      });
      renderCalls.push(options);
      return Object.assign(state, { settled, cancel });
    },
  });
  await api(request("composition.render", { plan: plan(), scope_id: clipID }));
  const deadline = Date.now() + 10000;
  while (!renderCalls.length && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  expect(renderCalls).toHaveLength(1);
  expect((await api(request("composition.delete", { artifact_ids: [artifact] }))).status).toBe(200);
  expect(stopped).toBe(true);
  expect(await store.snapshots.resolve(alice, artifact)).toBeNull();
  expect(await store.read(alice, artifact)).toBeNull();
  expect(
    (await api(request("composition.render", { plan: plan(), scope_id: clipID }))).status,
  ).toBe(404);
});

test("purge owner fences pending project creation and removes legacy workspaces", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const api = service({ editableStore: editable });
  await editable.create(alice, "Legacy workspace");
  const bobProject = await editable.create(bob, "Unaffected account");
  let release = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let preparing = false;
  const pending = editable.create(alice, "In flight", async (project) => {
    preparing = true;
    await hold;
    await writeFile(join(project.dir, "index.html"), "late write");
  });
  const failure = pending.catch((error: unknown) => error);
  while (!preparing) await new Promise((resolve) => setTimeout(resolve, 5));
  const deletion = api(request("composition.purge_owner", {}));
  while (!(await editable.ownerDisabled(alice)))
    await new Promise((resolve) => setTimeout(resolve, 5));
  release();
  expect((await deletion).status).toBe(200);
  expect(await failure).toBeInstanceOf(Error);
  expect((await readdir(editable.root)).includes(alice)).toBe(false);
  expect(await editable.resolve(bob, bobProject.id)).toBeTruthy();
  await expect(editable.create(alice, "Recreated")).rejects.toThrow("deleted");
  const restarted = service({
    store: new CompositionStore(join(root, "generated")),
    editableStore: new ProjectStore(editable.root),
  });
  expect((await restarted(request("composition.render", { plan: plan() }))).status).toBe(404);
  expect((await restarted(request("composition.purge_owner", {}))).status).toBe(200);
});

test("deletion waits for an editable import to publish and removes crash preparation directories", async () => {
  const editable = new ProjectStore(join(root, "editable"));
  const api = service({ editableStore: editable });
  await api(request("composition.render", { plan: plan(), scope_id: clipID }));
  await complete(api);
  let release = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let copying = false;
  const copy = store.copyTo.bind(store);
  store.copyTo = async (owner, id, destination) => {
    copying = true;
    await hold;
    return copy(owner, id, destination);
  };
  const importing = store.importProject(alice, artifact, editable, artifact, "Opening copy");
  while (!copying) await new Promise((resolve) => setTimeout(resolve, 5));
  const prepared = join(await store.snapshots.userHome(alice), `.prepare-${artifact}-interrupted`);
  await mkdir(prepared);
  await writeFile(join(prepared, "source.mp4"), "retained by interrupted preparation");
  const deleting = api(request("composition.delete_scope", { scope_id: clipID }));
  release();
  await importing;
  expect((await deleting).status).toBe(200);
  expect((await readdir(await editable.userHome(alice))).includes(artifact)).toBe(false);
  expect(
    (await readdir(await store.snapshots.userHome(alice))).some((name) =>
      name.startsWith(`.prepare-${artifact}-`),
    ),
  ).toBe(false);
});
