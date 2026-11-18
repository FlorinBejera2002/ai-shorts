import { expect, test } from "bun:test";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { studioStateObjects, verifyStateObjectConditions } from "./state-objects";
import { createStateStores, OWNER_ASSETS_ID } from "./state-stores";
import { ProjectStore } from "./store";
import { CompositionStore } from "./composition-store";
import { migrateStudioState } from "./migrate-state";
import { createApp } from "./app";
import { createUserRuntime } from "./runtime";
import { initializeProject } from "./starter";
import { sandboxThumbnail, startSandboxRender } from "./sandbox";
import { createCompositionService } from "./composition-service";
import type { RenderJobState } from "@hyperframes/studio-server";
import { dirname } from "node:path";

const integration = process.env.SNEEPCUT_TEST_STUDIO_S3 === "1" ? test : test.skip;
function localObjects() {
  const endpoint = new URL(process.env.SNEEPCUT_STUDIO_S3_ENDPOINT || "");
  if (
    endpoint.protocol !== "http:" ||
    !["seaweedfs", "127.0.0.1", "localhost"].includes(endpoint.hostname) ||
    process.env.AWS_S3_BUCKET !== (process.env.SEAWEEDFS_BUCKET || "sneepcut-dev")
  )
    throw new Error("Studio integration requires the private local development bucket");
  const objects = studioStateObjects();
  if (!objects) throw new Error("Studio S3 integration is not configured");
  return objects;
}
integration(
  "legacy migration preserves source files, composition records, receipts and owner fences",
  async () => {
    const objects = localObjects(),
      prefix = `studio-tests/${randomUUID()}`;
    const root = await realpath(await mkdtemp(join(tmpdir(), "studio-state-migration-test-")));
    const data = join(root, "projects"),
      owner = randomUUID(),
      deleted = randomUUID(),
      id = randomUUID(),
      receipt = randomUUID();
    try {
      const legacy = new ProjectStore(data),
        compositions = new CompositionStore(`${data}-compositions`);
      const original = await legacy.ensure(owner, id, "Legacy source", (p) =>
        writeFile(join(p.dir, "index.html"), "original source bytes"),
      );
      await compositions.snapshots.ensure(owner, id, "Legacy snapshot", (p) =>
        writeFile(join(p.dir, "index.html"), "immutable history"),
      );
      await compositions.reserve(owner, {
        artifact_id: id,
        hash: "legacy",
        status: "complete",
        progress: 100,
        width: 160,
        height: 90,
        duration: 1,
        preview_available: false,
      });
      const home = await legacy.userHome(owner);
      await mkdir(join(home, ".agent-receipts"));
      await writeFile(
        join(home, ".agent-receipts", `${receipt}.json`),
        JSON.stringify({ previous_html: "undo bytes" }),
      );
      await mkdir(join(home, ".media"));
      await writeFile(
        join(home, ".media/manifest.jsonl"),
        JSON.stringify({ id: "asset", reusable: true }),
      );
      await writeFile(join(home, ".media/source.png"), "asset bytes");
      await legacy.disableOwner(deleted);
      expect(await migrateStudioState(data, objects, prefix)).toEqual({
        projects: 3,
        receipts: 1,
        assets: 1,
        deletedOwners: 1,
      });
      expect(await migrateStudioState(data, objects, prefix)).toEqual({
        projects: 3,
        receipts: 1,
        assets: 1,
        deletedOwners: 1,
      });
      const replacement = createStateStores(join(root, "replacement"), objects, prefix);
      expect(
        await readFile(
          join((await replacement.store.resolve(owner, id))!.dir, "index.html"),
          "utf8",
        ),
      ).toBe("original source bytes");
      expect(
        await readFile(
          join((await replacement.compositions.completed(owner, id)).dir, "index.html"),
          "utf8",
        ),
      ).toBe("immutable history");
      expect(
        await readFile(
          join((await replacement.agentReceipts!.resolve(owner, receipt))!.dir, "receipt.json"),
          "utf8",
        ),
      ).toContain("undo bytes");
      expect(
        await readFile(
          join(
            (await replacement.ownerAssets!.resolve(owner, OWNER_ASSETS_ID))!.dir,
            ".media/source.png",
          ),
          "utf8",
        ),
      ).toBe("asset bytes");
      expect(await replacement.store.ownerDisabled(deleted)).toBe(true);
      expect(await readFile(join(original.dir, "index.html"), "utf8")).toBe(
        "original source bytes",
      );
    } finally {
      for (const key of await objects.list(`${prefix}/`)) await objects.delete(key);
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
integration(
  "private S3 saves, render outputs, composition history and fences survive cache loss",
  async () => {
    const objects = localObjects();
    const prefix = `studio-tests/${randomUUID()}`;
    const root = await realpath(await mkdtemp(join(tmpdir(), "studio-s3-integration-")));
    const owner = randomUUID(),
      stranger = randomUUID();
    const runtimes: ReturnType<typeof createUserRuntime>[] = [];
    const stores = (name: string) =>
      createStateStores(join(root, name, "projects"), objects, prefix);
    const app = (state: ReturnType<typeof stores>) =>
      createApp({
        appOrigin: "http://localhost:3000",
        editorOrigin: "http://localhost:5191",
        authBaseUrl: "http://synthetic.invalid",
        store: state.store,
        agentReceipts: state.agentReceipts,
        initializeProject,
        fetchAuth: async (_url, init) =>
          Response.json({
            user: {
              id:
                new Headers(init?.headers).get("Authorization") === "Bearer owner"
                  ? owner
                  : stranger,
              access_role: "member",
              deletion_pending: false,
            },
          }),
        createStudioApiForUser(user) {
          const runtime = createUserRuntime(user.id, state.store);
          runtimes.push(runtime);
          return runtime.api;
        },
      });
    const call = (
      server: ReturnType<typeof app>,
      route: string,
      method = "GET",
      body?: string,
      extra: Record<string, string> = {},
    ) =>
      server.request(`http://localhost:5191${route}`, {
        method,
        body,
        headers: {
          Authorization: "Bearer owner",
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
          ...extra,
        },
      });
    try {
      await verifyStateObjectConditions(objects, prefix);
      const first = stores("first"),
        server = app(first);
      const created = await call(
        server,
        "/sneepcut/projects",
        "POST",
        JSON.stringify({ title: "Synthetic S3 state" }),
      );
      expect(created.status).toBe(201);
      const { project } = await created.json();
      const route = `/api/projects/${project.id}/files/index.html`;
      const original = await (await call(server, route)).json();
      const html = original.content
        .replaceAll("1920", "160")
        .replaceAll("1080", "90")
        .replaceAll('data-duration="6"', 'data-duration="0.2"')
        .replace("Your story. Your edit.", "Durably saved");
      expect(
        (
          await call(server, route, "PUT", html, {
            "If-Match": original.version,
            "Content-Type": "text/html",
          })
        ).status,
      ).toBe(200);
      const source = (await first.store.resolve(owner, project.id))!;
      const rendered = await call(
        server,
        `/api/projects/${project.id}/render`,
        "POST",
        JSON.stringify({ fps: 5, quality: "draft", telemetryOptOut: true }),
      );
      expect(rendered.status).toBe(200);
      const { jobId } = await rendered.json();
      const deadline = Date.now() + 60_000;
      let renderState;
      do {
        renderState = await (await call(server, `/api/render/${jobId}/status`)).json();
        if (renderState.status !== "rendering") break;
        await Bun.sleep(25);
      } while (Date.now() < deadline);
      expect(renderState).toMatchObject({ status: "complete", verified: true });
      const outputPath = join(source.dir, "renders", `${jobId}.mp4`);
      expect((await readFile(outputPath)).subarray(4, 8).toString()).toBe("ftyp");
      const artifact = randomUUID();
      await first.compositions.snapshots.ensure(
        owner,
        artifact,
        "Immutable composition",
        async (p) => {
          await writeFile(join(p.dir, "index.html"), html);
          await mkdir(join(p.dir, "renders"));
          await writeFile(join(p.dir, "renders/composition.mp4"), await readFile(outputPath));
        },
      );
      await first.compositions.reserve(owner, {
        artifact_id: artifact,
        project_id: project.id,
        hash: "synthetic",
        status: "complete",
        progress: 100,
        duration: 0.2,
        width: 160,
        height: 90,
        preview_available: false,
      });
      await first.compositions.registerWorkspace(
        owner,
        artifact,
        project.id,
        "Accepted composition",
        true,
      );
      const receiptID = randomUUID();
      await first.agentReceipts!.ensure(owner, receiptID, "Undo receipt", (p) =>
        writeFile(join(p.dir, "receipt.json"), JSON.stringify({ previous_html: html })),
      );
      for (const runtime of runtimes.splice(0)) await runtime.close();
      await rm(join(root, "first"), { recursive: true, force: true });
      const second = stores("replacement-host"),
        reopened = app(second);
      const saved = await (await call(reopened, route)).json();
      expect(saved.content).toBe(html);
      expect(
        (
          await call(reopened, route, "PUT", original.content, {
            "If-Match": original.version,
            "Content-Type": "text/html",
          })
        ).status,
      ).toBe(409);
      expect(
        (await call(reopened, route, "GET", undefined, { Authorization: "Bearer stranger" }))
          .status,
      ).toBe(404);
      const restored = (await second.store.resolve(owner, project.id))!;
      expect(
        (await readFile(join(restored.dir, "renders", `${jobId}.mp4`))).subarray(4, 8).toString(),
      ).toBe("ftyp");
      expect(await (await call(reopened, `/api/render/${jobId}/status`)).json()).toMatchObject({
        status: "complete",
        verified: true,
      });
      expect((await call(reopened, `/api/render/${jobId}`, "DELETE")).status).toBe(200);
      const afterDeletion = stores("export-deletion-restart");
      const withoutExport = (await afterDeletion.store.resolve(owner, project.id))!;
      expect(await Bun.file(join(withoutExport.dir, "renders", `${jobId}.mp4`)).exists()).toBe(
        false,
      );
      expect((await second.compositions.completed(owner, artifact)).title).toBe(
        "Immutable composition",
      );
      expect(await second.compositions.workspaceHead(owner, project.id)).toBe(artifact);
      expect(await second.agentReceipts!.resolve(owner, receiptID)).not.toBeNull();
      const thumbnail = await sandboxThumbnail({
        project: restored,
        compPath: "index.html",
        seekTime: 0,
        width: 160,
        height: 90,
        outputWidth: 160,
        outputHeight: 90,
        previewUrl: `http://preview.invalid:5191/api/projects/${project.id}/preview/index.html`,
        signal: new AbortController().signal,
      });
      expect(thumbnail.length).toBeGreaterThan(100);
      await second.compositions.tombstone(owner, [artifact]);
      const third = stores("another-restart");
      await expect(third.compositions.completed(owner, artifact)).rejects.toThrow("deleted");
      await second.compositions.removeOwner(owner, second.store);
      await expect(third.store.resolve(owner, project.id)).rejects.toThrow("deleted");
      expect(await objects.list(`${prefix}/owners/${owner}/`)).toHaveLength(0);
    } finally {
      for (const runtime of runtimes) await runtime.close();
      for (const key of await objects.list(`${prefix}/`)) await objects.delete(key);
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

integration(
  "composition publication and regeneration preserve edits across independent S3-backed servers",
  async () => {
    const objects = localObjects(),
      prefix = `studio-tests/${randomUUID()}`;
    const root = await realpath(await mkdtemp(join(tmpdir(), "studio-s3-composition-")));
    const owner = randomUUID(),
      initial = randomUUID(),
      derived = randomUUID();
    const secret = "synthetic-studio-state-composition-secret";
    const state = (name: string) => createStateStores(join(root, name), objects, prefix);
    let renderCount = 0;
    const render: typeof startSandboxRender = (options) => {
      renderCount++;
      const result: RenderJobState = {
        id: options.jobId,
        outputPath: options.outputPath,
        progress: 0,
        status: "rendering",
      };
      const settled = (async () => {
        await mkdir(dirname(options.outputPath), { recursive: true });
        await writeFile(options.outputPath, "synthetic renderer output");
        result.status = "complete";
        result.progress = 100;
      })();
      return Object.assign(result, {
        settled,
        cancel() {
          result.status = "cancelled";
        },
      });
    };
    const service = (stores: ReturnType<typeof state>) =>
      createCompositionService({
        store: stores.compositions,
        editableStore: stores.store,
        secret,
        mediaOrigin: "https://app.test",
        pollMilliseconds: 1,
        render,
        fetcher: async () => new Response("synthetic source bytes"),
      });
    const request = (operation: string, input: unknown, id = initial) => {
      const body = JSON.stringify({ operation, request_id: id, input });
      const expiry = String(Math.floor(Date.now() / 1000) + 30);
      const digest = createHash("sha256").update(body).digest("hex");
      const grant = createHmac("sha256", secret)
        .update(`composition\n${owner}\n${expiry}\n${digest}`)
        .digest("hex");
      return new Request("http://studio/sneepcut/composition", {
        method: "POST",
        body,
        headers: { "X-Studio-Composition-Grant": `${owner}:${expiry}:${grant}` },
      });
    };
    const a = state("a"),
      b = state("b"),
      api = service(a),
      observer = service(b);
    async function complete(id: string) {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const response = await observer(request("composition.status", { artifact_id: id }));
        const receipt = await response.json();
        if (!response.ok || receipt.status === "failed") throw new Error(JSON.stringify(receipt));
        if (receipt.status === "complete") return;
        await Bun.sleep(10);
      }
      throw new Error("Composition did not finish");
    }
    const plan = {
      schema_version: 1,
      title: "Generated edit",
      width: 160,
      height: 90,
      duration: 1,
      dynamic_range: "sdr",
      assets: [
        {
          id: "source",
          kind: "video",
          name: "Source.mp4",
          url: "/media/source.mp4",
          duration: 2,
          width: 160,
          height: 90,
          has_audio: false,
        },
      ],
      scenes: [{ id: "scene", asset_id: "source", start: 0, duration: 1, source_in: 0 }],
      audio: [],
      overlays: [],
    };
    try {
      expect((await api(request("composition.render", { plan }))).status).toBe(202);
      // Poll on another server while A is running: it must not mark the live render interrupted.
      await complete(initial);
      expect((await observer(request("composition.commit", { artifact_id: initial }))).status).toBe(
        200,
      );
      const editable = (await b.store.resolve(owner, initial))!;
      const html = await readFile(join(editable.dir, "index.html"), "utf8");
      await writeFile(
        join(editable.dir, "index.html"),
        html.replace("<head>", '<head><meta name="manual-edit" content="preserved">'),
      );
      await b.store.save(owner, initial);
      const receiptA = (await a.compositions.read(owner, initial))!;
      const receiptB = (await b.compositions.read(owner, initial))!;
      receiptA.progress = 99;
      await a.compositions.write(owner, receiptA);
      receiptB.progress = 98;
      await expect(b.compositions.write(owner, receiptB)).rejects.toThrow(
        "changed on another server",
      );
      expect(
        (await api(request("composition.render", { plan, base_artifact_id: initial }, derived)))
          .status,
      ).toBe(202);
      await complete(derived);
      expect((await observer(request("composition.commit", { artifact_id: derived }))).status).toBe(
        200,
      );
      const replacement = state("replacement");
      const restored = (await replacement.store.resolve(owner, initial))!;
      expect(await readFile(join(restored.dir, "index.html"), "utf8")).toContain(
        'name="manual-edit"',
      );
      expect(await replacement.compositions.workspaceHead(owner, initial)).toBe(derived);
      expect(renderCount).toBe(2);
    } finally {
      for (const key of await objects.list(`${prefix}/`)) await objects.delete(key);
      await rm(root, { recursive: true, force: true });
    }
  },
  90_000,
);
