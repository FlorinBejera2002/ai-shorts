// Explicit provider smoke test, launched by scripts/test-hetzner-s3.mjs.
// Credentials arrive on stdin and are never persisted in the container.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClipImporter } from "./clip-import";
import { sandboxThumbnail, startSandboxRender } from "./sandbox";
import { StateConflict, studioStateObjects, verifyStateObjectConditions } from "./state-objects";
import { createStateStores } from "./state-stores";

function configuration(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") throw new Error("Expected smoke configuration");
  const result: Record<string, string> = {};
  for (const field of [
    "endpoint",
    "region",
    "bucket",
    "confirm_bucket",
    "access_key",
    "secret_key",
    "source_url",
    "sha256",
    "owner",
  ]) {
    const item: unknown = Reflect.get(value, field);
    if (typeof item !== "string" || !item) throw new Error(`Missing smoke field: ${field}`);
    result[field] = item;
  }
  if (
    !["hel1", "fsn1", "nbg1"].includes(result.region) ||
    result.endpoint !== `https://${result.region}.your-objectstorage.com` ||
    result.bucket !== result.confirm_bucket
  )
    throw new Error("An explicitly confirmed Hetzner bucket is required");
  if (
    new URL(result.source_url).origin !==
    `https://${result.bucket}.${result.region}.your-objectstorage.com`
  )
    throw new Error("Unexpected signed media origin");
  return result;
}

async function verify() {
  const config = configuration(await Bun.stdin.json());
  const objects = studioStateObjects({
    SNEEPCUT_STUDIO_STORAGE: "s3",
    SNEEPCUT_STUDIO_S3_ENDPOINT: config.endpoint,
    AWS_ACCESS_KEY_ID: config.access_key,
    AWS_SECRET_ACCESS_KEY: config.secret_key,
    AWS_REGION: config.region,
    AWS_S3_BUCKET: config.bucket,
  });
  assert.ok(objects);
  const prefix = `sneepcut-verification/${randomUUID()}/studio`;
  const root = await realpath(await mkdtemp(join(tmpdir(), "hetzner-studio-")));
  const stores = (name: string) => createStateStores(join(root, name, "projects"), objects, prefix);
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  try {
    await verifyStateObjectConditions(objects, prefix);
    console.log("PASS Studio conditional create, update and stale-write rejection");
    const first = stores("first");
    const clip = randomUUID();
    const importer = createClipImporter({
      store: first.store,
      compositions: first.compositions,
      apiOrigin: "http://synthetic.invalid",
      mediaOrigin: "https://app.test",
      mediaS3Origin: new URL(config.source_url).origin,
      fetcher: async (url, init) => {
        if (new URL(String(url)).hostname === "synthetic.invalid")
          return Response.json({
            id: clip,
            user_id: config.owner,
            title: "Hetzner verification",
            duration: 1,
            aspect_ratio: "16:9",
            file_url: config.source_url,
          });
        assert.equal(new Headers(init?.headers).has("Authorization"), false);
        return fetch(url, init);
      },
    });
    const project = await importer(config.owner, "Bearer synthetic", clip);
    assert.equal(digest(await readFile(join(project.dir, "assets/clip.mp4"))), config.sha256);
    // A small real video composition keeps this provider test fast.
    const html = (await readFile(join(project.dir, "index.html"), "utf8"))
      .replaceAll("1920", "160")
      .replaceAll("1080", "90");
    await writeFile(join(project.dir, "index.html"), html);
    await first.store.save(config.owner, project.id);
    console.log(
      "PASS Go-signed private video imported by Studio without forwarding API credentials",
    );
    const thumbnail = (selected: typeof project) =>
      sandboxThumbnail({
        project: selected,
        compPath: "index.html",
        seekTime: 0.5,
        width: 160,
        height: 90,
        outputWidth: 160,
        outputHeight: 90,
        previewUrl: `http://preview.invalid:5191/api/projects/${selected.id}/preview/index.html`,
        signal: new AbortController().signal,
      });
    const preview = await thumbnail(project);
    // Studio captures JPEG previews; check the real response format.
    assert.ok(preview.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
    const jobID = randomUUID();
    const job = startSandboxRender(
      {
        project,
        jobId: jobID,
        outputPath: join(project.dir, "renders", `${jobID}.mp4`),
        format: "mp4",
        fps: { num: 12, den: 1 },
        quality: "draft",
      },
      first.store.checkpoint(config.owner, project.id),
    );
    await job.settled;
    assert.equal(job.status, "complete", job.error);
    const output = await readFile(job.outputPath);
    assert.equal(output.subarray(4, 8).toString(), "ftyp");
    console.log("PASS sandboxed Chromium thumbnail and FFmpeg render persisted to Hetzner");
    await rm(join(root, "first"), { recursive: true, force: true });
    const second = stores("second");
    const restored = await second.store.resolve(config.owner, project.id);
    assert.ok(restored);
    assert.equal(await readFile(join(restored.dir, "index.html"), "utf8"), html);
    assert.equal(digest(await readFile(join(restored.dir, "assets/clip.mp4"))), config.sha256);
    assert.equal(
      digest(await readFile(join(restored.dir, "renders", `${jobID}.mp4`))),
      digest(output),
    );
    assert.ok((await thumbnail(restored)).subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
    const third = stores("third");
    const competitor = await third.store.resolve(config.owner, project.id);
    assert.ok(competitor);
    await writeFile(join(restored.dir, "index.html"), `${html}\n<!-- writer A -->`);
    await writeFile(join(competitor.dir, "index.html"), `${html}\n<!-- writer B -->`);
    const writes = await Promise.allSettled([
      second.store.save(config.owner, project.id),
      third.store.save(config.owner, project.id),
    ]);
    assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1);
    for (const result of writes)
      if (result.status === "rejected") assert.ok(result.reason instanceof StateConflict);
    console.log(
      "PASS cache-loss recovery of source, project and render; competing server saves reject the loser",
    );
  } finally {
    try {
      for (const key of await objects.list(`${prefix}/`)) {
        assert.ok(key.startsWith(`${prefix}/`));
        await objects.delete(key);
      }
      assert.equal((await objects.list(`${prefix}/`)).length, 0);
      console.log("PASS Studio synthetic object cleanup");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}

await verify().catch((error: unknown) => {
  // Lower-level network errors can embed signed URLs. The host runner needs only failure status.
  console.error(
    "FAIL Studio Hetzner verification:",
    error instanceof Error
      ? error.message.replace(/https?:\/\/\S+/g, "[redacted URL]")
      : "unknown error",
  );
  process.exitCode = 1;
});
