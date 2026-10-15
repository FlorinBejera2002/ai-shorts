// Trusted synthetic media only. Exercises service staging/commit with the real producer.
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRenderJob, executeRenderJob } from "@hyperframes/producer";
import { drainBrowserPool } from "../../engine/src/index";
import type { RenderJobState } from "@hyperframes/studio-server";
import { createCompositionService } from "../src/composition-service";
import { CompositionStore } from "../src/composition-store";
import { ProjectStore } from "../src/store";
import { createClipImporter } from "../src/clip-import";
import type { CanonicalCompositionPlan } from "../src/canonical-composition";

const repository = resolve(import.meta.dir, "../../../..");
const scratchRoot = join(repository, ".cache/tmp");
await mkdir(scratchRoot, { recursive: true });
const scratch = await mkdtemp(join(scratchRoot, "manual-regeneration-"));
const ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH ?? "ffmpeg";
const owner = randomUUID(),
  projectId = randomUUID(),
  clipId = randomUUID();
const secret = `synthetic-${randomUUID()}`;
const editable = new ProjectStore(join(scratch, "editable"));
const compositions = new CompositionStore(join(scratch, "compositions"));
const jobs = new Set<Promise<void>>();

async function command(args: string[]) {
  const child = Bun.spawn([ffmpeg, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (await child.exited) throw new Error(err);
  return out;
}
const api = createCompositionService({
  store: compositions,
  editableStore: editable,
  secret,
  mediaOrigin: "https://synthetic.test",
  pollMilliseconds: 20,
  fetcher: async () => new Response(await readFile(join(scratch, "camera.mp4"))),
  render(options) {
    const state: RenderJobState = {
      id: options.jobId,
      status: "rendering",
      progress: 0,
      outputPath: options.outputPath,
    };
    const job = createRenderJob({
      fps: 30,
      quality: "draft",
      format: "mp4",
      hdrMode: options.hdrMode,
      workers: 1,
    });
    const settled = executeRenderJob(job, options.project.dir, options.outputPath)
      .then(() => {
        state.status = "complete";
        state.progress = 100;
      })
      .catch((error: unknown) => {
        state.status = "failed";
        state.error = String(error);
      });
    jobs.add(settled);
    void settled.finally(() => jobs.delete(settled));
    return Object.assign(state, {
      settled,
      cancel: () => {
        /* The trusted short fixture drains before exit. */
      },
    });
  },
});

async function request(operation: string, input: unknown, requestId = randomUUID()) {
  const body = JSON.stringify({
    operation: `composition.${operation}`,
    input,
    request_id: requestId,
  });
  const expiry = String(Math.floor(Date.now() / 1000) + 60);
  const hash = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", secret)
    .update(`composition\n${owner}\n${expiry}\n${hash}`)
    .digest("hex");
  return api(
    new Request("http://studio/sneepcut/composition", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        "X-Studio-Composition-Grant": `${owner}:${expiry}:${signature}`,
      },
    }),
  );
}
async function json(operation: string, input: unknown, id?: string) {
  const response = await request(operation, input, id);
  const result = await response.json();
  assert.equal(response.ok, true, `${operation}: ${JSON.stringify(result)}`);
  return result;
}
async function render(plan: CanonicalCompositionPlan, base?: string) {
  const id = randomUUID();
  await json(
    "render",
    { plan, ...(base ? { base_artifact_id: base } : { project_id: projectId }) },
    id,
  );
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const result = await json("status", { artifact_id: id });
    if (result.status === "failed") throw new Error(result.error);
    if (result.status === "complete") return { id, result };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Native regeneration timed out");
}
async function rms(path: string, name: string) {
  const output = join(scratch, `${name}.pcm`);
  await command([
    "-v",
    "error",
    "-ss",
    "0.2",
    "-i",
    path,
    "-t",
    "0.3",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-f",
    "f32le",
    output,
  ]);
  const bytes = await readFile(output);
  const values = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let power = 0;
  for (let i = 0; i < bytes.byteLength; i += 4) power += values.getFloat32(i, true) ** 2;
  return Math.sqrt(power / (bytes.byteLength / 4));
}

try {
  await command([
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=red:s=320x180:r=30:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    join(scratch, "camera.mp4"),
  ]);
  const plan: CanonicalCompositionPlan = {
    schema_version: 1,
    title: "Manual regeneration fixture",
    width: 320,
    height: 180,
    duration: 1,
    dynamic_range: "sdr",
    assets: [
      {
        id: "camera",
        name: "Camera",
        kind: "video",
        url: "/media/camera.mp4",
        duration: 3,
        width: 320,
        height: 180,
        has_audio: true,
      },
    ],
    scenes: [{ id: "first", asset_id: "camera", start: 0, duration: 1, source_in: 0 }],
    audio: [
      {
        id: "voice",
        asset_id: "camera",
        scene_id: "first",
        start: 0,
        duration: 1,
        source_in: 0,
        volume: 1,
      },
    ],
    overlays: [
      {
        id: "title",
        text: "Original automatic title",
        start: 0,
        duration: 1,
        x: 150,
        y: 130,
        width: 140,
        height: 35,
      },
    ],
  };
  const first = await render(plan);
  await json("commit", { artifact_id: first.id });
  let workspace = await editable.resolve(owner, projectId);
  assert(workspace, "Initial accepted output must create the shared workspace");
  const scenePath = join(workspace.dir, "source-scene-1.html");
  const scene = await readFile(scenePath, "utf8");
  assert(scene.includes('data-volume="1"'));
  await writeFile(scenePath, scene.replace('data-volume="1"', 'data-volume="0.2"'));
  const entry = await readFile(join(workspace.dir, "index.html"), "utf8");
  await writeFile(
    join(workspace.dir, "index.html"),
    entry
      .replace("Original automatic title", "My manual title")
      .replace(
        "</body>",
        '<div id="my-manual-layer" class="clip" data-start="0" data-duration="1" data-track-index="5" style="position:absolute;left:10px;top:10px;width:40px;height:40px;background:#00ff00;z-index:100"></div></body>',
      ),
  );
  await writeFile(join(workspace.dir, "manual-notes.txt"), "Manual project asset must survive");
  const next = structuredClone(plan);
  next.title = "New automatic revision";
  next.overlays![0].text = "New automatic title";
  next.overlays!.push({
    id: "automatic-added",
    text: "New generated layer",
    start: 0,
    duration: 1,
    x: 170,
    y: 80,
    width: 130,
    height: 30,
  });
  const second = await render(next, first.id);
  await json("commit", { artifact_id: second.id });
  assert.equal(second.result.project_id, projectId);
  workspace = await editable.resolve(owner, projectId);
  assert(workspace, "Accepted regeneration must keep the shared project available");
  const merged = await readFile(join(workspace.dir, "index.html"), "utf8");
  assert(merged.includes("My manual title"));
  assert(merged.includes("New generated layer"));
  assert(merged.includes("my-manual-layer"));
  assert.equal(
    await readFile(join(workspace.dir, "manual-notes.txt"), "utf8"),
    "Manual project asset must survive",
  );
  const original = await compositions.completed(owner, first.id);
  const updated = await compositions.completed(owner, second.id);
  const ratio =
    (await rms(join(updated.dir, "renders/video.mp4"), "updated")) /
    (await rms(join(original.dir, "renders/video.mp4"), "original"));
  assert(ratio > 0.17 && ratio < 0.23, `Manual gain must survive the actual render: ${ratio}`);
  const pixelPath = join(scratch, "manual-layer.rgb");
  await command([
    "-v",
    "error",
    "-ss",
    "0.5",
    "-i",
    join(updated.dir, "renders/video.mp4"),
    "-vf",
    "crop=2:2:20:20,scale=1:1",
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    pixelPath,
  ]);
  const pixel = await readFile(pixelPath);
  assert(pixel[1] > 180 && pixel[0] < 60 && pixel[2] < 60, `Manual layer pixels: ${[...pixel]}`);
  const importer = createClipImporter({
    store: editable,
    compositions,
    apiOrigin: "https://synthetic.test",
    mediaOrigin: "https://synthetic.test",
    fetcher: async () =>
      Response.json({
        id: clipId,
        user_id: owner,
        title: "Clip",
        duration: 1,
        file_url: "/media/export.mp4",
        studio_artifact_id: second.id,
      }),
  });
  assert.equal((await importer(owner, "Bearer synthetic", clipId)).id, projectId);
  await writeFile(join(workspace.dir, "manual-notes.txt"), "Newer manual change");
  assert.equal(
    (await request("commit", { artifact_id: second.id })).status,
    409,
    "A stale retry must not overwrite later manual work",
  );
  assert.equal(
    await readFile(join(workspace.dir, "manual-notes.txt"), "utf8"),
    "Newer manual change",
  );
  console.log(
    JSON.stringify({
      same_project: true,
      manual_title: true,
      new_automatic_layer: true,
      manual_asset: true,
      manual_layer_rgb: [...pixel],
      manual_gain_ratio: ratio,
      stale_commit_rejected: true,
    }),
  );
} finally {
  await Promise.allSettled(jobs);
  await drainBrowserPool();
  await rm(scratch, { recursive: true, force: true });
}
