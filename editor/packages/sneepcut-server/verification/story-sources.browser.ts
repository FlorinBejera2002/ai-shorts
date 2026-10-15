/**
 * Run from the repository root after building Studio and core's runtime:
 *   FFMPEG_PATH=/path/to/ffmpeg bun editor/packages/sneepcut-server/verification/story-sources.browser.ts
 * Uses a synthetic owner, mocked owned Story API, real importer/runtime, and local
 * Chromium. No persistent user database or media is accessed. Outputs are kept in
 * frontend/test-results; the generated source, profile and store are disposable.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer-core";
import { parseHTML } from "linkedom";
import { readClipTiming } from "@hyperframes/core/composition-contract";
import { createApp } from "../src/app";
import { findSystemChrome } from "../src/browser";
import { createClipImporter } from "../src/clip-import";
import { createUserRuntime } from "../src/runtime";
import { initializeProject } from "../src/starter";
import { ProjectStore } from "../src/store";
import { getMimeType } from "../../studio-server/src/index";
import { verifySourceControls } from "./story-source-controls.browser";
import { verifySourceSfx } from "./story-source-sfx.browser";
import { verifyLongSourceTimeline } from "./story-source-timeline.browser";

const owner = "11111111-1111-4111-8111-111111111111";
const clipId = "33333333-3333-4333-8333-333333333333";
const storyId = "44444444-4444-4444-8444-444444444444";
const fixturePort = Number(process.env.STUDIO_SOURCES_PORT ?? 5195);
const origin = `http://localhost:${fixturePort}`;
const editorRoot = fileURLToPath(new URL("../../../", import.meta.url));
const outputs = resolve(
  process.env.STUDIO_SOURCES_OUTPUT ?? join(editorRoot, "../frontend/test-results"),
);
const scratchRoot = resolve(
  process.env.STUDIO_SOURCES_SCRATCH ?? join(editorRoot, "../.cache/tmp"),
);
const realMedia = process.env.STUDIO_SOURCES_MEDIA;
const secondMedia = process.env.STUDIO_SOURCES_SECOND_MEDIA;
await mkdir(outputs, { recursive: true });
await mkdir(scratchRoot, { recursive: true });
const scratch = await mkdtemp(join(scratchRoot, "studio-sources-"));
const store = new ProjectStore(join(scratch, "data"));
let browser: Browser | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let runtime: ReturnType<typeof createUserRuntime> | undefined;

async function seek(page: Page, preview: Frame, time: number): Promise<void> {
  if (await page.$('button[aria-label="Pause"]'))
    await page.locator('button[aria-label="Pause"]').click();
  const position = await page.evaluate((target) => {
    const firstElement = document.querySelector('[data-el-id="index.html#scene-1"]')!;
    const secondElement = document.querySelector('[data-el-id="index.html#scene-2"]')!;
    const first = firstElement.getBoundingClientRect();
    const second = secondElement.getBoundingClientRect();
    const firstStart = Number(firstElement.getAttribute("data-clip-start"));
    const secondStart = Number(secondElement.getAttribute("data-clip-start"));
    const ruler = document
      .querySelector('[data-timeline-grid-cell="major"]')!
      .getBoundingClientRect();
    return {
      x: first.x + ((second.x - first.x) / (secondStart - firstStart)) * (target - firstStart),
      y: ruler.y + 10,
    };
  }, time);
  await page.mouse.click(position.x, position.y);
  await preview
    .waitForFunction(
      (target) => {
        const video = document.querySelector("video");
        return (
          video &&
          video.readyState >= 2 &&
          !video.seeking &&
          Math.abs(video.currentTime - target - 1) < 0.1
        );
      },
      { timeout: 10000 },
      time,
    )
    .catch(async (error) => {
      console.log(
        "SEEK FAILED",
        time,
        await preview.evaluate(() =>
          [...document.querySelectorAll("video")].map((video) => ({
            time: video.currentTime,
            ready: video.readyState,
            seeking: video.seeking,
            paused: video.paused,
            start: video.dataset.start,
            mediaStart: video.dataset.mediaStart,
            duration: video.dataset.duration,
          })),
        ),
      );
      throw error;
    });
}

async function decodedEvidence(
  page: Page,
  preview: Frame,
  label: string,
  expectedSourceOffset = 1,
  expectedDuration = 2,
): Promise<void> {
  if (await page.$('button[aria-label="Inspector"][aria-pressed="true"]'))
    await page.locator('button[aria-label="Inspector"]').click();
  console.log(label, "seeking source");
  await preview
    .waitForFunction(
      ({ offset, duration }) => {
        const video = document.querySelector("video");
        return (
          video &&
          Math.abs(Number(video.dataset.mediaStart) - offset) < 0.01 &&
          Math.abs(Number(video.dataset.duration) - duration) < 0.02
        );
      },
      {},
      { offset: expectedSourceOffset, duration: expectedDuration },
    )
    .catch(async (error) => {
      console.log(
        "SOURCE TIMING FAILED",
        JSON.stringify({
          label,
          expectedSourceOffset,
          expectedDuration,
          previewUrl: preview.url(),
          frameUrls: page.frames().map((frame) => frame.url()),
          documents: await Promise.all(
            page
              .frames()
              .filter((frame) => frame.url().includes("/preview?"))
              .map(async (frame) => ({
                url: frame.url(),
                sameFrame: frame === preview,
                state: await frame
                  .evaluate(() => ({
                    url: document.URL,
                    ready: document.readyState,
                    renderReady: (window as unknown as { __renderReady?: boolean }).__renderReady,
                    hosts: [...document.querySelectorAll("[data-source-window]")].map((host) =>
                      Object.fromEntries(
                        [...host.attributes].map((attribute) => [attribute.name, attribute.value]),
                      ),
                    ),
                    videos: [...document.querySelectorAll("video")].map((video) => ({
                      attributes: Object.fromEntries(
                        [...video.attributes].map((attribute) => [attribute.name, attribute.value]),
                      ),
                      ready: video.readyState,
                      time: video.currentTime,
                      seeking: video.seeking,
                      paused: video.paused,
                      error: video.error?.message,
                    })),
                  }))
                  .catch((failure) => ({ failure: String(failure) })),
              })),
          ),
        }),
      );
      throw error;
    });
  await seek(page, preview, 1);
  // Set up once per DOM element after the user's Play gesture. Reload/Undo
  // creates a fresh iframe context; wait for actual signal rather than a delay.
  await page.locator('button[aria-label="Play"]').click();
  await preview.evaluate(async () => {
    const fixture = window as unknown as {
      sourceAudio?: { video: HTMLVideoElement; context: AudioContext; analyser: AnalyserNode };
    };
    const video = document.querySelector("video")!;
    if (fixture.sourceAudio?.video === video) return;
    await fixture.sourceAudio?.context.close();
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 4096;
    context.createMediaElementSource(video).connect(analyser);
    analyser.connect(context.destination);
    fixture.sourceAudio = { video, context, analyser };
  });
  const audio = await preview.evaluate(async (expectedTone) => {
    const { context, analyser, video } = (
      window as unknown as {
        sourceAudio: { video: HTMLVideoElement; context: AudioContext; analyser: AnalyserNode };
      }
    ).sourceAudio;
    await Promise.race([
      context.resume(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`AudioContext is ${context.state}`)), 3000),
      ),
    ]);
    let peak = 0;
    let tone = -Infinity;
    const samples = new Uint8Array(analyser.fftSize);
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((done) => setTimeout(done, 80));
      analyser.getByteTimeDomainData(samples);
      analyser.getFloatFrequencyData(spectrum);
      peak = Math.max(peak, ...samples.map((sample) => Math.abs(sample - 128)));
      const bin = Math.round((440 * analyser.fftSize) / context.sampleRate);
      tone = Math.max(tone, ...spectrum.slice(bin - 1, bin + 2));
      if (peak > 2 && (!expectedTone || tone > -55)) break;
    }
    return {
      peak,
      tone,
      context: context.state,
      muted: video.muted,
      volume: video.volume,
      paused: video.paused,
      sourceTime: video.currentTime,
      sourceOffset: video.dataset.mediaStart,
      connected: video.isConnected,
      videoDuration: video.dataset.duration,
      videoStart: video.dataset.start,
    };
  }, !realMedia);
  const owner = await page.evaluate(
    () =>
      (document.querySelector("hyperframes-player") as unknown as { _audioOwner: string })
        ._audioOwner,
  );
  assert.equal(owner, "runtime", "Fixture must exercise native camera audio");
  assert.ok(
    audio.peak > 2 && (realMedia || audio.tone > -55),
    `Camera audio missing: ${JSON.stringify(audio)}`,
  );
  assert.ok(!audio.muted && audio.volume === 1 && !audio.paused && audio.context === "running");
  assert.ok(Math.abs(Number(audio.sourceOffset) - expectedSourceOffset) < 0.01);
  assert.ok(audio.sourceTime >= 1.95 && audio.sourceTime < 2.8, JSON.stringify(audio));
  await seek(page, preview, 1.15);
  const picture = await preview.evaluate(() => {
    const video = document.querySelector("video")!;
    const canvas = document.createElement("canvas");
    canvas.width = 36;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, 36, 64);
    const pixels = ctx.getImageData(0, 0, 36, 64).data;
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 150) bright++;
    const word = [...document.querySelectorAll<HTMLElement>('[id*="caption"][id*="word"]')].find(
      (element) => element.textContent === "WORLD",
    )!;
    const style = getComputedStyle(word);
    return {
      ready: video.readyState,
      time: video.currentTime,
      bright,
      caption: {
        text: word.textContent,
        visibility: style.visibility,
        opacity: style.opacity,
        fill: style.backgroundSize,
        width: word.getBoundingClientRect().width,
      },
    };
  });
  assert.ok(picture.ready >= 2 && picture.bright > 500, JSON.stringify(picture));
  assert.ok(Math.abs(picture.time - 2.15) < 0.1, "The scene must play its source in-point");
  assert.equal(picture.caption.visibility, "visible");
  assert.ok(Number(picture.caption.opacity) > 0 && picture.caption.width > 0);
  assert.ok(picture.caption.fill.includes("%"), "Karaoke animation must still run");
  console.log(label, JSON.stringify({ audioOwner: owner, audio, picture }));
}

async function touchClipEdge(
  page: Page,
  delta: number,
  edge: "left" | "right" = "right",
): Promise<void> {
  const clip = await page.$('button[data-el-id="index.html#scene-1"]');
  assert.ok(clip);
  const tapRect = await clip.boundingBox();
  assert.ok(tapRect);
  if (process.env.STUDIO_SOURCES_DEBUG)
    await page.evaluate(() => {
      for (const event of ["pointerdown", "pointerup", "click"])
        document.addEventListener(
          event,
          (e) => {
            const target = e.target as Element;
            console.log(
              "[hf-select]",
              JSON.stringify({
                event,
                target: target.tagName,
                clip: target.closest("[data-el-id]")?.getAttribute("data-el-id"),
              }),
            );
          },
          { capture: true, once: true },
        );
    });
  await page.touchscreen.tap(tapRect.x + tapRect.width / 2, tapRect.y + tapRect.height / 2);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-el-id="index.html#scene-1"]')?.getAttribute("aria-pressed") ===
      "true",
  );
  const rect = await clip.boundingBox();
  assert.ok(rect);
  const x = edge === "left" ? rect.x + 5 : rect.x + rect.width - 5;
  const y = rect.y + rect.height / 2;
  const client = await page.createCDPSession();
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 5; step++)
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (delta * step) / 5, y }],
      });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await client.detach();
  }
}

try {
  if (!realMedia) {
    const generated = spawnSync(
      process.env.FFMPEG_PATH ?? "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=360x640:rate=15:duration=6",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=6",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        join(scratch, "source.mp4"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(generated.status, 0, generated.stderr || String(generated.error));
  }
  const media = await readFile(realMedia ?? join(scratch, "source.mp4"));
  const second = secondMedia ? await readFile(secondMedia) : media;
  const font = await readFile(
    process.env.STUDIO_SOURCES_FONT ??
      join(editorRoot, "../backend/internal/captions/assets/inter-900.ttf"),
  );
  let longTimeline = false;
  const importer = createClipImporter({
    store,
    apiOrigin: origin,
    mediaOrigin: origin,
    probeAudio: async () => true,
    fetcher: async (input) => {
      const url = String(input);
      if (url.includes("/api/clips/"))
        return Response.json({
          id: longTimeline ? "33333333-3333-4333-8333-333333333334" : clipId,
          user_id: owner,
          title: "Decoded source and caption fixture",
          duration: longTimeline ? 46 : 4,
          aspect_ratio: "9:16",
          file_url: `${origin}/media/render.mp4`,
          story_project_id: storyId,
          story_version: longTimeline ? 2 : 1,
        });
      if (url.includes("/api/stories/"))
        return Response.json({
          id: storyId,
          options: {
            aspect_ratio: "9:16",
            caption_mode: "all",
            caption_style: { font_id: "builtin:inter", weight: 900, preset: "karaoke" },
          },
          assets: [
            {
              id: "a",
              name: realMedia ? "Voice source" : "Color source",
              source_url: `${origin}/media/a.mp4`,
              duration: Number(process.env.STUDIO_SOURCES_DURATION ?? 6),
              has_audio: true,
              video_codec: "h264",
              audio_codec: "aac",
            },
            ...(secondMedia
              ? [
                  {
                    id: "b",
                    name: "Car source",
                    source_url: `${origin}/media/b.mp4`,
                    duration: Number(process.env.STUDIO_SOURCES_SECOND_DURATION ?? 6),
                    has_audio: true,
                    video_codec: "h264",
                    audio_codec: "aac",
                  },
                ]
              : []),
          ],
          versions: [
            {
              number: longTimeline ? 2 : 1,
              accepted: true,
              output: { captions: true },
              timeline: longTimeline
                ? Array.from({ length: 11 }, (_, index) => {
                    const start = index < 10 ? index * 4 : 41;
                    const duration = index < 9 ? 4 : 5;
                    const sourceId = secondMedia && index % 2 ? "b" : "a";
                    return {
                      block_id: `long-${index}`,
                      output_in: start,
                      output_out: start + duration,
                      video: { source_id: sourceId, in: 0, out: duration },
                      audio: { source_id: sourceId, in: 0, out: duration },
                      words: [],
                    };
                  })
                : [
                    {
                      block_id: "one",
                      output_in: 0,
                      output_out: 2,
                      video: { source_id: "a", in: 1, out: 3 },
                      audio: { source_id: "a", in: 1, out: 3 },
                      words: [
                        { text: "HELLO", start: 0.1, end: 0.8 },
                        { text: "WORLD", start: 0.9, end: 1.8 },
                      ],
                    },
                    {
                      block_id: "two",
                      output_in: 2,
                      output_out: 4,
                      video: { source_id: secondMedia ? "b" : "a", in: 2, out: 4 },
                      audio: { source_id: secondMedia ? "b" : "a", in: 2, out: 4 },
                      words: [{ text: "SECOND", start: 2.1, end: 3.8 }],
                    },
                  ],
            },
          ],
        });
      return new Response(
        url.includes("/font-file") ? font : url.includes("/media/b.mp4") ? second : media,
      );
    },
  });
  const project = await importer(owner, "Bearer synthetic-fixture", clipId);
  const authoredScene = await readFile(join(project.dir, "source-scene-1.html"), "utf8");
  runtime = createUserRuntime(owner, store);
  const app = createApp({
    appOrigin: origin,
    editorOrigin: origin,
    authBaseUrl: "http://synthetic.invalid",
    store,
    initializeProject,
    createStudioApiForUser: () => runtime!.api,
    fetchAuth: async () =>
      Response.json({
        user: {
          id: owner,
          name: "Synthetic",
          access_role: "member",
          deletion_pending: false,
        },
      }),
  });
  const staticRoot = join(editorRoot, "packages/studio/dist");
  app.get("*", async (c) => {
    const path = resolve(staticRoot, c.req.path === "/" ? "index.html" : c.req.path.slice(1));
    if (relative(staticRoot, path).startsWith("..")) return c.notFound();
    try {
      return new Response(await readFile(path), { headers: { "Content-Type": getMimeType(path) } });
    } catch {
      return c.notFound();
    }
  });
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: fixturePort,
    idleTimeout: 255,
    fetch: (request) => app.fetch(request),
  });
  browser = await puppeteer.launch({
    executablePath: findSystemChrome(),
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      ...(process.env.STUDIO_SOURCES_TRUSTED_CONTAINER === "1" ? ["--no-sandbox"] : []),
    ],
    userDataDir: join(scratch, "chrome"),
  });
  const page = await browser.newPage();
  if (process.env.STUDIO_SOURCES_DEBUG) {
    await page.evaluateOnNewDocument(() => localStorage.setItem("hf-select-debug", "1"));
    page.on("console", async (message) => {
      if (message.text().includes("[hf-select]"))
        console.log(
          "SELECTION",
          ...(await Promise.all(message.args().map((arg) => arg.jsonValue()))),
        );
    });
  }
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const errors: string[] = [];
  const badCache: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(String(error));
    console.log("PAGE ERROR", String(error));
  });
  page.on("response", (response) => {
    if (process.env.STUDIO_SOURCES_DEBUG && /\.(?:mp4|mov)(?:\?|$)/i.test(response.url()))
      console.log(
        "MEDIA RESPONSE",
        response.status(),
        response.headers()["content-type"],
        response.url(),
      );
    if (response.status() >= 400 && response.url().includes("/gsap-animations/"))
      badCache.push(response.url());
  });
  await page.goto(`${origin}/health`);
  await page.evaluate(async () => {
    await fetch("/sneepcut/session", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-fixture" },
    });
  });
  await page.goto(`${origin}/#project/${project.id}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const preview = await page.waitForFrame((frame) => frame.url().includes("/preview?"), {
    timeout: 60000,
  });
  await preview.waitForFunction(() =>
    [...document.querySelectorAll("video")].some((video) => video.readyState >= 2),
  );
  await page.waitForSelector('[data-el-id="index.html#scene-1"]');
  if (process.env.STUDIO_SOURCES_DEBUG)
    console.log(
      "THUMBNAIL FIBER",
      await page.$eval('[data-el-id="index.html#scene-1"]', (element) => {
        const record = element as unknown as Record<string, any>;
        let fiber = record[Object.keys(record).find((key) => key.startsWith("__reactFiber$"))!];
        const output: unknown[] = [];
        for (let count = 0; fiber && count < 12; count++, fiber = fiber.return) {
          if (fiber.memoizedProps?.el) output.push({ clip: fiber.memoizedProps.el });
        }
        const walk = (node: any, depth: number) => {
          if (!node || depth > 8) return;
          if (node.memoizedProps?.videoSrc || node.memoizedProps?.previewUrl)
            output.push({ props: node.memoizedProps });
          walk(node.child, depth + 1);
          walk(node.sibling, depth + 1);
        };
        walk(record[Object.keys(record).find((key) => key.startsWith("__reactFiber$"))!], 0);
        return output;
      }),
    );
  if (!process.env.STUDIO_SOURCES_SKIP_THUMBNAILS)
    await page
      .waitForFunction(() => {
        const image = document.querySelector<HTMLImageElement>(
          '[data-el-id="index.html#scene-1"] img',
        );
        return image && image.complete && image.naturalWidth > 0;
      })
      .catch(async (error) => {
        console.log(
          "THUMBNAIL FAILED",
          await page.$eval('[data-el-id="index.html#scene-1"]', (element) => element.innerHTML),
        );
        console.log(
          "THUMBNAIL ROW",
          await page.$eval('[data-el-id="index.html#scene-1"]', (element) => {
            const record = element as unknown as Record<string, any>;
            let fiber = record[Object.keys(record).find((key) => key.startsWith("__reactFiber$"))!];
            while (fiber) {
              if (fiber.memoizedProps?.el) return fiber.memoizedProps.el;
              fiber = fiber.return;
            }
            return null;
          }),
        );
        console.log(
          "THUMBNAIL DOM",
          await preview.evaluate(() => ({
            ready: (window as unknown as { __renderReady?: boolean }).__renderReady,
            documentState: document.readyState,
            loadEventEnd: (
              performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
            )?.loadEventEnd,
            host: document.querySelector("[data-source-window]")?.outerHTML,
            realm: [...document.querySelectorAll("[data-source-window],video")].map((element) => ({
              tag: element.tagName,
              constructor: element.constructor.name,
              ownerWindow: element.ownerDocument.defaultView === window,
              html: element instanceof HTMLElement,
              media: element instanceof HTMLMediaElement,
              parentHtml: element instanceof parent.HTMLElement,
              parentMedia: element instanceof parent.HTMLMediaElement,
              prototype: Object.getPrototypeOf(element)?.constructor?.name,
            })),
          })),
        );
        await page.screenshot({
          path: join(outputs, "studio-thumbnail-failed.png"),
          fullPage: true,
        });
        throw error;
      });
  if (!process.env.STUDIO_SOURCES_LONG_ONLY && !process.env.STUDIO_SOURCES_INITIAL_ONLY) {
    await decodedEvidence(page, preview, "INITIAL");
    await page.screenshot({ path: join(outputs, "studio-decoded-captions.png"), fullPage: true });
    if (!process.env.STUDIO_SOURCES_CONTROLS_ONLY) {
      await touchClipEdge(page, -25);
      await page.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')?.disabled,
      );
      await page
        .waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 })
        .catch(() => {});
      const trimmed = await readFile(join(project.dir, "index.html"), "utf8");
      const trimmedScene = parseHTML(trimmed).document.getElementById("scene-1")!;
      const trimmedDuration = readClipTiming(trimmedScene).duration!;
      assert.ok(
        trimmedDuration > 1.2 && trimmedDuration < 2,
        `Unexpected trim duration ${trimmedDuration}`,
      );
      await decodedEvidence(page, preview, "AFTER TOUCH TRIM", 1, trimmedDuration);
      assert.equal(
        await readFile(join(project.dir, "source-scene-1.html"), "utf8"),
        authoredScene,
        "Runtime-projected attributes must never overwrite the authored source file",
      );
      await page.locator('button[aria-label="Undo"]').click();
      await page.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>('button[aria-label="Redo"]')?.disabled,
      );
      await page
        .waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 })
        .catch(() => {});
      await decodedEvidence(page, preview, "AFTER UNDO");
      assert.equal(
        (await page.$$("button[data-el-id]")).length,
        2,
        "Source video and captions must stay grouped under their two source scenes",
      );
      await page.screenshot({
        path: join(outputs, "studio-decoded-after-undo.png"),
        fullPage: true,
      });
      await touchClipEdge(page, 25, "left");
      await page
        .waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 })
        .catch(() => {});
      const leftTrimmed = parseHTML(
        await readFile(join(project.dir, "index.html"), "utf8"),
      ).document.getElementById("scene-1")!;
      const sourceOffset = Number(leftTrimmed.getAttribute("data-playback-start"));
      assert.ok(
        sourceOffset > 1.2 && sourceOffset < 1.8,
        "Left trim must advance the original source in-point",
      );
      await decodedEvidence(
        page,
        preview,
        "AFTER LEFT TRIM",
        sourceOffset,
        readClipTiming(leftTrimmed).duration!,
      );
      await page.locator('button[aria-label="Undo"]').click();
      await page
        .waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 })
        .catch(() => {});
      await touchClipEdge(page, 25);
      await page
        .waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 })
        .catch(() => {});
      const extended = parseHTML(
        await readFile(join(project.dir, "index.html"), "utf8"),
      ).document.getElementById("scene-1")!;
      assert.ok(
        readClipTiming(extended).duration! > 2,
        "The scene must extend beyond its originally generated cut",
      );
      await decodedEvidence(page, preview, "AFTER EXTEND", 1, readClipTiming(extended).duration!);
      await page.locator('button[aria-label="Undo"]').click();
      await page.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>('button[aria-label="Redo"]')?.disabled,
      );
      await page.locator('button[aria-label="Redo"]').click();
      await page
        .waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 })
        .catch(() => {});
      await decodedEvidence(page, preview, "AFTER REDO", 1, readClipTiming(extended).duration!);
      await page.locator('button[aria-label="Undo"]').click();
      await page
        .waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 })
        .catch(() => {});
    }
    console.log(
      "CONTROLS",
      await verifySourceControls({ page, preview, projectDir: project.dir, outputDir: outputs }),
    );
    console.log("SFX", await verifySourceSfx({ page, preview, projectDir: project.dir }));
    await page.select('select[aria-label="Video aspect ratio"]', "4:5");
    await page.waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 }).catch(() => {});
    const dimensions = async (path: string) => {
      const root = parseHTML(
        await readFile(join(project.dir, path), "utf8"),
      ).document.querySelector("[data-composition-id]")!;
      return [root.getAttribute("data-width"), root.getAttribute("data-height")];
    };
    const waitForDimensions = async (height: string) => {
      const deadline = Date.now() + 15_000;
      const paths = ["index.html", "source-scene-1.html", "source-scene-2.html"];
      while (Date.now() < deadline) {
        if (
          (await Promise.all(paths.map(dimensions))).every(
            ([width, actual]) => width === "1080" && actual === height,
          )
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.deepEqual(
        await Promise.all(paths.map(dimensions)),
        paths.map(() => ["1080", height]),
        "Aspect ratio must persist in root and each source scene",
      );
    };
    await waitForDimensions("1350");
    for (const path of ["index.html", "source-scene-1.html", "source-scene-2.html"])
      assert.deepEqual(
        await dimensions(path),
        ["1080", "1350"],
        `Aspect ratio must update ${path}`,
      );
    await page.locator('button[aria-label="Undo"]').click();
    await waitForDimensions("1920");
    assert.deepEqual(await dimensions("source-scene-1.html"), ["1080", "1920"]);
    await page.locator('button[aria-label="Redo"]').click();
    await waitForDimensions("1350");
    assert.deepEqual(await dimensions("source-scene-1.html"), ["1080", "1350"]);
  }
  if (!process.env.STUDIO_SOURCES_INITIAL_ONLY) {
    longTimeline = true;
    const longProject = await importer(
      owner,
      "Bearer synthetic-fixture",
      "33333333-3333-4333-8333-333333333334",
    );
    // Model opening another Story in Studio as an independent editor load.
    await page.goto(`${origin}/health`);
    await page.goto(`${origin}/#project/${longProject.id}`, { waitUntil: "domcontentloaded" });
    console.log(
      "LONG TIMELINE",
      await verifyLongSourceTimeline({
        page,
        projectDir: longProject.dir,
        projectId: longProject.id,
        outputDir: outputs,
      }),
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(badCache, [], "Nested composition animation requests must resolve after Undo");
  const diagnostic =
    process.env.STUDIO_SOURCES_CONTROLS_ONLY ||
    process.env.STUDIO_SOURCES_INITIAL_ONLY ||
    process.env.STUDIO_SOURCES_LONG_ONLY ||
    process.env.STUDIO_SOURCES_SKIP_THUMBNAILS;
  console.log(
    diagnostic
      ? "DIAGNOSTIC COMPLETED: selected checks passed; full source editing gate was not run"
      : "PASS: decoded source pixels, camera audio, captions, touch trim/extension, Undo/Redo, selected/all adjustments, SFX, aspect ratio, loaded thumbnails and mobile 11-cut pan/Fit",
  );
} catch (error) {
  const pages = await browser?.pages();
  const page = pages?.at(-1);
  if (page) {
    console.log(
      "FAILED PAGE",
      page.url(),
      await page.evaluate(() => document.body.innerText).catch(() => "unavailable"),
    );
    console.log(
      "FAILED FRAMES",
      page.frames().map((frame) => frame.url()),
    );
    await page
      .screenshot({ path: join(outputs, "studio-failure.png"), fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  server?.stop(true);
  runtime?.close();
  await rm(scratch, { recursive: true, force: true });
}
