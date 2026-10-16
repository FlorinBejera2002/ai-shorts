/**
 * Real Studio preview versus delivered MP4, using disposable synthetic sources.
 * Run after building core's runtime, with Bun, FFmpeg/FFprobe and local Chrome:
 *   bun editor/packages/sneepcut-server/verification/native-transitions.ts
 * HYPERFRAMES_FFMPEG_PATH, HYPERFRAMES_FFPROBE_PATH and
 * PRODUCER_HEADLESS_SHELL_PATH select the installed binaries.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createRenderJob, executeRenderJob } from "@hyperframes/producer";
import { drainBrowserPool } from "../../engine/src/index";
import { createStudioServer, closeThumbnailBrowser } from "../../cli/src/server/studioServer";
import { bundledGsap } from "../src/assets";
import { findSystemChrome } from "../src/browser";
import {
  compileCanonicalComposition,
  type CanonicalCompositionPlan,
} from "../src/canonical-composition";

const editorRoot = resolve(import.meta.dir, "../../..");
const root = resolve(editorRoot, "..");
const runtimePath = join(editorRoot, "packages/core/dist/hyperframe.runtime.iife.js");
const runtimeSHA256 = createHash("sha256")
  .update(await readFile(runtimePath))
  .digest("hex");
const manifest = JSON.parse(
  await readFile(join(editorRoot, "packages/core/dist/hyperframe.manifest.json"), "utf8"),
);
assert.equal(runtimeSHA256, manifest.sha256, "runtime must match the built manifest");
console.log(JSON.stringify({ runtimeSHA256 }));
const scratchRoot = process.env.SNEEPCUT_VERIFICATION_SCRATCH ?? join(root, ".cache/tmp");
await mkdir(scratchRoot, { recursive: true });
const scratch = await mkdtemp(join(scratchRoot, "native-transitions-"));
const ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH ?? "ffmpeg";
const ffprobe = process.env.HYPERFRAMES_FFPROBE_PATH ?? "ffprobe";
const chrome = process.env.PRODUCER_HEADLESS_SHELL_PATH ?? findSystemChrome();
process.env.PRODUCER_HEADLESS_SHELL_PATH = chrome;
const width = 320,
  height = 180,
  fps = 30,
  frameSize = width * height * 3;
type Picture = { rgb: number[]; captionPixels: number };

async function command(executable: string, args: string[]): Promise<Buffer> {
  const child = Bun.spawn([executable, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
  ]);
  if (await child.exited) throw new Error(`${executable}: ${stderr}`);
  return Buffer.from(stdout);
}

function framePicture(bytes: Uint8Array): Picture {
  const at = (60 * width + 160) * 3;
  let captionPixels = 0;
  for (let i = 120 * width * 3; i < frameSize; i += 3) {
    if (bytes[i]! > 180 && bytes[i + 1]! > 180 && bytes[i + 2]! > 180) captionPixels++;
  }
  return { rgb: [...bytes.subarray(at, at + 3)], captionPixels };
}

// Native browser video decoding and FFmpeg's render-frame conversion can use
// different color matrices. Compare transition weights against each decoder's
// own unblended endpoints so this test measures compositing, not color policy.
function blendWeights(rgb: number[], red: number[], blue: number[]): number[] {
  const determinant = red[0]! * blue[2]! - blue[0]! * red[2]!;
  assert.ok(Math.abs(determinant) > 1000, "fixture endpoints must be distinct");
  return [
    (rgb[0]! * blue[2]! - rgb[2]! * blue[0]!) / determinant,
    (red[0]! * rgb[2]! - red[2]! * rgb[0]!) / determinant,
  ];
}

async function previewPicture(page: Page, frame: number): Promise<Picture> {
  await page.evaluate(async (time) => {
    const videos = Array.from(document.querySelectorAll("video"));
    const callbacks = new Map<HTMLVideoElement, number>();
    const pending = videos.map((video) => {
      const previousTime = video.currentTime;
      const presented = new Promise<void>((resolve) => {
        const observe: VideoFrameRequestCallback = (_now, metadata) => {
          if (
            metadata.mediaTime <= video.currentTime + 0.0001 &&
            metadata.mediaTime >= video.currentTime - 1 / 30 - 0.0001
          )
            resolve();
          else callbacks.set(video, video.requestVideoFrameCallback(observe));
        };
        callbacks.set(video, video.requestVideoFrameCallback(observe));
      });
      return { video, previousTime, presented };
    });
    const player = (window as unknown as { __player: { pause(): void; seek(time: number): void } })
      .__player;
    player.pause();
    player.seek(time);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // readyState/seeked describe decoded data, not the frame submitted to the
    // compositor. Await presentation before using screenshots as pixel evidence.
    let timeout = 0;
    try {
      await Promise.race([
        Promise.all(
          pending
            .filter(
              ({ video, previousTime }) =>
                video.currentTime !== previousTime &&
                getComputedStyle(video).visibility === "visible",
            )
            .map(({ presented }) => presented),
        ),
        new Promise((_, reject) => {
          timeout = window.setTimeout(
            () => reject(new Error("Video frame was not presented after seeking")),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      for (const [video, callback] of callbacks) video.cancelVideoFrameCallback(callback);
    }
  }, frame / fps);
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
  await page.waitForFunction(() =>
    [...document.querySelectorAll("video")].every(
      (video) => video.readyState >= 2 && !video.seeking,
    ),
  );
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  // Decode the screenshot of the composited page, never a raw source <video>.
  const screenshot = await page.screenshot({ type: "png" });
  return page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const bytes = context.getImageData(0, 0, 320, 180).data;
    const at = (60 * 320 + 160) * 4;
    let captionPixels = 0;
    for (let i = 120 * 320 * 4; i < bytes.length; i += 4) {
      if (bytes[i]! > 180 && bytes[i + 1]! > 180 && bytes[i + 2]! > 180) captionPixels++;
    }
    return { rgb: [...bytes.slice(at, at + 3)], captionPixels };
  }, Buffer.from(screenshot).toString("base64"));
}

async function createFixture(name: string, trimmed: boolean): Promise<string> {
  const project = join(scratch, name);
  await mkdir(join(project, "assets"), { recursive: true });
  await mkdir(join(project, "vendor"));
  const assetDuration = trimmed ? 2 : 1;
  for (const [id, color, excluded] of [
    ["left", "red", "lime"],
    ["right", "blue", "yellow"],
  ]) {
    // Excluded pictures make accidental pre-roll/post-roll disclosure detectable.
    const filter =
      `color=${color}:s=${width}x${height}:r=${fps}:d=${assetDuration}` +
      (trimmed ? `,drawbox=color=${excluded}:t=fill:enable='lt(t,0.5)+gte(t,1.5)'` : "");
    await command(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      filter,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      join(project, `assets/${id}.mp4`),
    ]);
  }
  await command(ffmpeg, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=2",
    "-c:a",
    "pcm_s16le",
    join(project, "assets/voice.wav"),
  ]);
  const plan: CanonicalCompositionPlan = {
    schema_version: 1,
    title: name,
    width,
    height,
    duration: 2,
    dynamic_range: "sdr",
    assets: [
      ...["left", "right"].map((id) => ({
        id,
        name: id,
        kind: "video" as const,
        url: `/media/${id}.mp4`,
        duration: assetDuration,
        width,
        height,
      })),
      {
        id: "voice",
        name: "Continuous tone",
        kind: "audio",
        url: "/media/voice.wav",
        duration: 2,
        has_audio: true,
      },
    ],
    scenes: [
      { id: "scene-left", asset_id: "left", start: 0, duration: 1, source_in: trimmed ? 0.5 : 0 },
      {
        id: "scene-right",
        asset_id: "right",
        start: 1,
        duration: 1,
        source_in: trimmed ? 0.5 : 0,
        transition_in: 0.3,
      },
    ],
    audio: [{ id: "voice-layer", asset_id: "voice", start: 0, duration: 2, source_in: 0 }],
    captions: {
      groups: [
        [{ text: "LEFT", start: 0.7, end: 0.95 }],
        [{ text: "RIGHT", start: 1.05, end: 1.3 }],
      ],
      style: { preset: "word-by-word", size: 0.1, text_color: "#FFFFFF", outline: 2 },
    },
  };
  const compiled = compileCanonicalComposition(
    plan,
    new Map([
      ["left", "assets/left.mp4"],
      ["right", "assets/right.mp4"],
      ["voice", "assets/voice.wav"],
    ]),
  );
  for (const [name, source] of compiled.files) await writeFile(join(project, name), source);
  const gsap = bundledGsap("gsap.min.js");
  assert.ok(gsap, "bundled GSAP is required");
  await writeFile(join(project, "vendor/gsap.min.js"), gsap);
  return project;
}

let browser: Browser | undefined;
try {
  browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: [
      "--force-color-profile=srgb",
      ...(process.env.SNEEPCUT_ISOLATED_CONTAINER === "1" ? ["--no-sandbox"] : []),
    ],
  });
  for (const trimmed of [false, true]) {
    const name = trimmed ? "selected-interior" : "source-edges";
    const project = await createFixture(name, trimmed);
    const output = join(scratch, `${name}.mp4`);
    await executeRenderJob(
      createRenderJob({ fps, quality: "draft", format: "mp4", hdrMode: "force-sdr", workers: 1 }),
      project,
      output,
    );
    const probe = JSON.parse(
      (
        await command(ffprobe, [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=duration,avg_frame_rate",
          "-of",
          "json",
          output,
        ])
      ).toString(),
    );
    assert.equal(Number(probe.streams[0].duration), 2, "nominal video duration changed");
    assert.equal(probe.streams[0].avg_frame_rate, "30/1");
    const raw = await command(ffmpeg, [
      "-v",
      "error",
      "-i",
      output,
      "-an",
      "-pix_fmt",
      "rgb24",
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      "-",
    ]);
    assert.equal(raw.length, 60 * frameSize, "export lost or added frames");
    const exported = (frame: number) =>
      framePicture(raw.subarray(frame * frameSize, (frame + 1) * frameSize));
    let mixed = 0;
    for (let frame = 0; frame < 60; frame++) {
      const { rgb } = exported(frame);
      assert.ok(
        rgb[1]! < 20 && rgb[0]! + rgb[2]! >= 220,
        `${name} frame ${frame}: dark dip or excluded picture ${rgb}`,
      );
      if (frame <= 25)
        assert.ok(rgb[0]! > 230 && rgb[2]! < 15, `${name}: early transition ${frame}: ${rgb}`);
      else if (frame >= 35)
        assert.ok(rgb[2]! > 230 && rgb[0]! < 15, `${name}: late transition ${frame}: ${rgb}`);
      else if (rgb[0]! > 15 && rgb[2]! > 15) mixed++;
    }
    assert.ok(mixed >= 5, `${name}: expected several mixed frames, got ${mixed}`);

    const runtime = createStudioServer({ projectDir: project, projectName: name });
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: runtime.app.fetch });
    const page = await browser.newPage();
    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${server.port}/api/projects/${name}/preview`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForFunction(() =>
        Boolean((window as unknown as { __playerReady?: boolean }).__playerReady),
      );
      await page.evaluate(() => document.fonts.ready);
      const previewRed = (await previewPicture(page, 18)).rgb;
      const previewBlue = (await previewPicture(page, 42)).rgb;
      const exportRed = exported(18).rgb,
        exportBlue = exported(42).rgb;
      const checkpoints = [
        18,
        24,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        36,
        42,
        ...Array.from({ length: 10 }, () => [18, 30, 42, 30]).flat(),
      ];
      const pictures = [];
      for (const frame of checkpoints) {
        const preview = await previewPicture(page, frame),
          rendered = exported(frame);
        const previewMix = blendWeights(preview.rgb, previewRed, previewBlue);
        const exportMix = blendWeights(rendered.rgb, exportRed, exportBlue);
        const expectedGreen = previewMix[0]! * previewRed[1]! + previewMix[1]! * previewBlue[1]!;
        if (Math.abs(preview.rgb[1]! - expectedGreen) > 15) {
          console.error(
            await page.evaluate(() =>
              Array.from(document.querySelectorAll("video"), (video) => {
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 1;
                const context = canvas.getContext("2d")!;
                context.drawImage(video, 0, 0, 1, 1);
                return {
                  id: video.id,
                  time: video.currentTime,
                  freeze: video.dataset.freezeAt,
                  rgb: Array.from(context.getImageData(0, 0, 1, 1).data),
                  visible: getComputedStyle(video).visibility,
                };
              }),
            ),
          );
        }
        assert.ok(
          Math.abs(preview.rgb[1]! - expectedGreen) <= 15,
          `${name} preview included excluded source colors at frame ${frame}: ${preview.rgb}`,
        );
        assert.ok(
          previewMix[0]! + previewMix[1]! >= 0.9,
          `${name} preview darkened at frame ${frame}: ${preview.rgb}`,
        );
        for (let source = 0; source < 2; source++) {
          assert.ok(
            Math.abs(previewMix[source]! - exportMix[source]!) <= 0.05,
            `${name} preview/export blend differs at frame ${frame}: ${previewMix} / ${exportMix}`,
          );
        }
        const expectedCaption =
          (frame / fps >= 0.7 && frame / fps < 0.95) || (frame / fps >= 1.05 && frame / fps < 1.3);
        assert.equal(
          preview.captionPixels > 5,
          expectedCaption,
          `${name} preview caption shifted at frame ${frame}`,
        );
        assert.equal(
          rendered.captionPixels > 5,
          expectedCaption,
          `${name} export caption shifted at frame ${frame}`,
        );
        pictures.push({ frame, preview: preview.rgb, export: rendered.rgb, previewMix, exportMix });
      }
      console.log(
        JSON.stringify({
          verified: name,
          runtimeSHA256,
          duration: 2,
          frames: 60,
          mixed,
          captions: "unchanged",
          pictures,
        }),
      );
    } finally {
      await page.close();
      server.stop(true);
      await runtime.watcher.close();
    }
  }
  assert.equal(
    createHash("sha256")
      .update(await readFile(runtimePath))
      .digest("hex"),
    runtimeSHA256,
    "runtime changed during verification",
  );
} finally {
  await Promise.allSettled([browser?.close(), closeThumbnailBrowser(), drainBrowserPool()]);
  await rm(scratch, { recursive: true, force: true });
}
