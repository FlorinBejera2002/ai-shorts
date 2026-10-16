/** Isolated real Studio: two-finger transforms, text pixels, undo/redo and reload. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createApp } from "../src/app";
import { findSystemChrome } from "../src/browser";
import { createUserRuntime } from "../src/runtime";
import { initializeProject } from "../src/starter";
import { ProjectStore } from "../src/store";
import { getMimeType } from "../../studio-server/src/index";
import { createRenderJob, executeRenderJob } from "@hyperframes/producer";
import { drainBrowserPool } from "../../engine/src/index";
import { closeThumbnailBrowser } from "../../cli/src/server/studioServer";
import {
  createRootCaptionFixture,
  verifyRootCaptionGestures,
} from "./mobile-caption-scope.browser";

const root = resolve(import.meta.dir, "../../../..");
const scratchRoot = join(root, ".cache/tmp");
await mkdir(scratchRoot, { recursive: true });
const scratch = await mkdtemp(join(scratchRoot, "mobile-gestures-"));
assert.ok(
  scratch.startsWith(scratchRoot + "\\") || scratch.startsWith(scratchRoot + "/"),
  "Scratch must remain inside workspace",
);
const outputs = join(
  root,
  "frontend/test-results/mobile-feedback",
  process.env.STUDIO_ROOT_CAPTION_ANIMATION ?? "",
);
await mkdir(outputs, { recursive: true });
const owner = "22222222-2222-4222-8222-222222222222";
const id = "55555555-5555-4555-8555-555555555555";
const store = new ProjectStore(join(scratch, "data"));
const port = Number(process.env.STUDIO_GESTURES_PORT ?? 5198);
const origin = `http://localhost:${port}`;
let browser: Browser | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let runtime: ReturnType<typeof createUserRuntime> | undefined;

async function pixels(path: string, time = 0) {
  const task = Bun.spawn(
    [
      process.env.HYPERFRAMES_FFMPEG_PATH ?? "ffmpeg",
      "-v",
      "error",
      "-ss",
      String(time),
      "-i",
      path,
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "-",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [bytes, stderr] = await Promise.all([
    new Response(task.stdout).arrayBuffer(),
    new Response(task.stderr).text(),
  ]);
  assert.equal(await task.exited, 0, stderr);
  const data = new Uint8Array(bytes);
  const bounds = (test: (r: number, g: number, b: number) => boolean) => {
    let left = 360,
      top = 640,
      right = 0,
      bottom = 0,
      count = 0;
    for (let i = 0; i < data.length; i += 3) {
      if (!test(data[i]!, data[i + 1]!, data[i + 2]!)) continue;
      const x = (i / 3) % 360,
        y = Math.floor(i / 3 / 360);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      count++;
    }
    return { left, top, right, bottom, count };
  };
  return {
    text: bounds((r, g, b) => r > 210 && g > 210 && b > 210),
    logo: bounds((r, g, b) => r > 200 && g > 150 && b < 70),
  };
}

async function waitIdle(page: Page) {
  await page.waitForNetworkIdle({ concurrency: 2, idleTime: 600, timeout: 10000 }).catch(() => {});
}
async function state(page: Page) {
  const preview = await page.waitForFrame((frame) => frame.url().includes("/preview?"));
  return preview.evaluate(() => {
    const caption = document.getElementById("caption")!;
    const logo = document.getElementById("logo")!;
    return {
      font: Number.parseFloat(getComputedStyle(caption).fontSize),
      caption: caption.getBoundingClientRect().toJSON(),
      logo: logo.getBoundingClientRect().toJSON(),
    };
  });
}
async function pinch(page: Page, scale: number) {
  const box = await page.$('[data-dom-edit-selection-box="true"]');
  assert.ok(box, "selected layer must have gesture chrome");
  const rect = (await box.boundingBox())!;
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  const start = Math.min(20, rect.width / 4);
  assert.ok(start >= 5, "preview must be large enough to touch");
  const cdp = await page.createCDPSession();
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, x: x - start, y },
        { id: 2, x: x + start, y },
      ],
    });
    for (let step = 1; step <= 8; step++) {
      const distance = start * (1 + ((scale - 1) * step) / 8);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { id: 1, x: x - distance, y },
          { id: 2, x: x + distance, y },
        ],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
  await waitIdle(page);
}

async function drag(page: Page, dx: number, dy: number) {
  const box = await page.$('[data-dom-edit-selection-box="true"]');
  const rect = (await box!.boundingBox())!;
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  const cdp = await page.createCDPSession();
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y }],
    });
    for (let step = 1; step <= 8; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, x: x + (dx * step) / 8, y: y + (dy * step) / 8 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
  await waitIdle(page);
}

async function selectionGeometry(page: Page, id: string) {
  const preview = await page.waitForFrame((frame) => frame.url().includes("/preview?"));
  const iframe = await preview.frameElement();
  const frame = (await iframe!.boundingBox())!;
  const geometry = await preview.evaluate((elementId) => {
    const root = document.querySelector("[data-composition-id]")!;
    return {
      element: document.getElementById(elementId)!.getBoundingClientRect().toJSON(),
      width: Number(root.getAttribute("data-width")),
      height: Number(root.getAttribute("data-height")),
    };
  }, id);
  const scaleX = frame.width / geometry.width;
  const scaleY = frame.height / geometry.height;
  const actual = {
    x: frame.x + geometry.element.x * scaleX,
    y: frame.y + geometry.element.y * scaleY,
    width: geometry.element.width * scaleX,
    height: geometry.element.height * scaleY,
  };
  const selection = await page.$eval('[data-dom-edit-selection-box="true"]', (element) =>
    element.getBoundingClientRect().toJSON(),
  );
  return { actual, selection };
}

try {
  const project = await store.ensure(
    owner,
    id,
    "Mobile feedback synthetic fixture",
    async (project) => {
      await initializeProject(project);
      await writeFile(
        join(project.dir, "logo.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" rx="4" fill="#ffcc00"/></svg>',
      );
      await writeFile(
        join(project.dir, "index.html"),
        `<!doctype html><html><head><meta charset="utf-8"><script src="vendor/gsap.min.js"></script><style>body{margin:0;background:#151515}#main{position:relative;width:360px;height:640px;overflow:hidden;background:#233448}.clip{position:absolute;box-sizing:border-box}#caption{left:60px;top:380px;width:240px;height:60px;font:32px/1.2 Arial;color:white;white-space:nowrap}#logo{left:100px;top:150px;width:120px;height:60px}</style></head><body><div id="main" data-composition-id="main" data-width="360" data-height="640" data-duration="2"><div id="caption" class="clip" data-start="0" data-duration="2" data-track-index="1"><span>Two words</span></div><img id="logo" class="clip" data-start="0" data-duration="2" data-track-index="2" src="logo.svg"></div><script>const tl=gsap.timeline({paused:true});tl.set("#caption",{opacity:1},0);tl.set("#logo",{opacity:1},0);window.__timelines["main"]=tl;</script></body></html>`,
      );
    },
  );
  runtime = createUserRuntime(owner, store);
  const captionProjectId = "55555555-5555-4555-8555-555555555556";
  const captionProject = await store.ensure(
    owner,
    captionProjectId,
    "Root narration gesture fixture",
    async (project) => {
      await initializeProject(project);
      await createRootCaptionFixture(project.dir);
    },
  );
  const app = createApp({
    appOrigin: origin,
    editorOrigin: origin,
    authBaseUrl: "http://synthetic.invalid",
    store,
    initializeProject,
    createStudioApiForUser: () => runtime!.api,
    fetchAuth: async () =>
      Response.json({
        user: { id: owner, name: "Synthetic", access_role: "member", deletion_pending: false },
      }),
  });
  const staticRoot = join(root, "editor/packages/studio/dist");
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
    port,
    idleTimeout: 255,
    fetch: (request) => app.fetch(request),
  });
  browser = await puppeteer.launch({
    executablePath: findSystemChrome(),
    headless: true,
    userDataDir: join(scratch, "chrome"),
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewport({
    width: 390,
    height: 844,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  await page.goto(`${origin}/health`);
  if (process.env.STUDIO_ROOT_CAPTION_ONLY)
    await page.evaluate(() => localStorage.setItem("hf-drag-debug", "1"));
  await page.evaluate(async () =>
    fetch("/sneepcut/session", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-fixture" },
    }),
  );
  process.env.PRODUCER_HEADLESS_SHELL_PATH ??= findSystemChrome();
  if (!process.env.STUDIO_ROOT_CAPTION_ONLY) {
    await page.goto(`${origin}/#project/${id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector('[data-el-id="index.html#caption"]', { timeout: 60000 });
    await page.locator('[data-el-id="index.html#caption"]').click();
    await page.waitForSelector('[data-dom-edit-selection-box="true"]');
    await waitIdle(page);
    const layout = await page.evaluate(() => {
      const inspector = document
        .querySelector('[aria-label="Inspector panel"]')!
        .getBoundingClientRect();
      const canvas = document
        .querySelector('[aria-label="Composition canvas"]')!
        .getBoundingClientRect();
      return { inspector: inspector.toJSON(), canvas: canvas.toJSON() };
    });
    assert.ok(layout.canvas.height >= 150, "inspector leaves a usable video preview");
    assert.ok(layout.inspector.y >= layout.canvas.bottom - 1, "controls sit below the preview");
    const before = await state(page);
    await pinch(page, 1.5);
    const resized = await state(page);
    assert.ok(
      resized.font >= before.font * 1.4,
      `font must visibly grow: ${before.font} -> ${resized.font}`,
    );
    const saved = await readFile(join(project.dir, "index.html"), "utf8");
    assert.match(saved, /fontSize/);
    await page.locator('button[aria-label="Undo"]').click();
    await waitIdle(page);
    assert.ok(
      Math.abs((await state(page)).font - before.font) < 0.1,
      "one undo restores the entire pinch",
    );
    await page.locator('button[aria-label="Redo"]').click();
    await waitIdle(page);
    assert.ok(
      Math.abs((await state(page)).font - resized.font) < 0.1,
      "one redo restores the pinch",
    );
    await page.locator('[data-el-id="index.html#logo"]').click();
    await waitIdle(page);
    const logoBefore = await state(page);
    await pinch(page, 1.35);
    const logoAfter = await state(page);
    assert.ok(logoAfter.logo.width >= logoBefore.logo.width * 1.25, "logo pinch changes pixels");
    await drag(page, 10, 15);
    const logoDragged = await state(page);
    assert.ok(
      logoDragged.logo.x > logoAfter.logo.x + 10 && logoDragged.logo.y > logoAfter.logo.y + 20,
      "one-finger drag moves the logo",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-el-id="index.html#caption"]');
    await waitIdle(page);
    const reloaded = await state(page);
    assert.ok(Math.abs(reloaded.font - resized.font) < 0.1, "caption size survives reload");
    assert.ok(
      Math.abs(reloaded.logo.width - logoAfter.logo.width) < 0.1,
      "logo size survives reload",
    );
    assert.ok(
      Math.abs(reloaded.logo.x - logoDragged.logo.x) < 0.1 &&
        Math.abs(reloaded.logo.y - logoDragged.logo.y) < 0.1,
      "logo position survives reload",
    );
    await page.locator('[data-el-id="index.html#caption"]').click();
    await waitIdle(page);
    const chrome = await selectionGeometry(page, "caption");
    for (const key of ["x", "y", "width", "height"] as const)
      assert.ok(
        Math.abs(chrome.actual[key] - chrome.selection[key]) < 2,
        `selection ${key} matches caption pixels`,
      );
    await page.screenshot({ path: join(outputs, "studio-mobile.png"), fullPage: true });
    const previewFrame = await page.waitForFrame((frame) => frame.url().includes("/preview?"));
    const exportPreview = await browser.newPage();
    await exportPreview.setViewport({ width: 360, height: 640, deviceScaleFactor: 1 });
    await exportPreview.goto(previewFrame.url(), { waitUntil: "domcontentloaded" });
    await exportPreview.waitForFunction(() =>
      Boolean((window as unknown as { __playerReady?: boolean }).__playerReady),
    );
    await exportPreview.evaluate(() => document.fonts.ready);
    const previewImage = join(scratch, "preview.png");
    await exportPreview.screenshot({ path: previewImage });
    const video = join(scratch, "edited.mp4");
    await executeRenderJob(
      createRenderJob({
        fps: 15,
        quality: "draft",
        format: "mp4",
        hdrMode: "force-sdr",
        workers: 1,
      }),
      project.dir,
      video,
    );
    const previewPixels = await pixels(previewImage),
      exportPixels = await pixels(video);
    await writeFile(
      join(outputs, "studio-summary.json"),
      JSON.stringify(
        {
          status: "checking",
          layout,
          before,
          resized,
          logoBefore,
          logoAfter,
          reloaded,
          previewPixels,
          exportPixels,
          errors,
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(outputs, "edited-source.html"),
      await readFile(join(project.dir, "index.html")),
    );
    await writeFile(join(outputs, "edited.mp4"), await readFile(video));
    for (const kind of ["text", "logo"] as const) {
      assert.ok(previewPixels[kind].count > 50 && exportPixels[kind].count > 50);
      for (const edge of ["left", "top", "right", "bottom"] as const)
        assert.ok(
          Math.abs(previewPixels[kind][edge] - exportPixels[kind][edge]) <= 3,
          `${kind} ${edge} differs between preview/export`,
        );
    }
    assert.deepEqual(errors, []);
    await writeFile(
      join(outputs, "studio-summary.json"),
      JSON.stringify(
        {
          status: "passed",
          layout,
          before,
          resized,
          logoBefore,
          logoAfter,
          logoDragged,
          chrome,
          reloaded,
          previewPixels,
          exportPixels,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: actual two-touch caption/logo resizing, logo drag, aligned selection, visible mobile preview, one-step undo/redo, saved source, reload and matching export pixels",
    );
    await exportPreview.close();
  }
  const rootGestures = await verifyRootCaptionGestures({
    page,
    url: `${origin}/#project/${captionProjectId}`,
    directory: captionProject.dir,
    outputs,
    pinch,
    drag,
    waitIdle,
  });
  const rootPreview = await page.waitForFrame((frame) => frame.url().includes("/preview?"));
  const rootExportPreview = await browser.newPage();
  await rootExportPreview.setViewport({ width: 360, height: 640, deviceScaleFactor: 1 });
  await rootExportPreview.goto(rootPreview.url(), { waitUntil: "domcontentloaded" });
  await rootExportPreview.waitForFunction(() =>
    Boolean((window as unknown as { __playerReady?: boolean }).__playerReady),
  );
  await rootExportPreview.evaluate(() => document.fonts.ready);
  const rootVideo = join(scratch, "root-caption.mp4");
  await executeRenderJob(
    createRenderJob({ fps: 30, quality: "draft", format: "mp4", hdrMode: "force-sdr", workers: 1 }),
    captionProject.dir,
    rootVideo,
  );
  const rootExportEvidence = [];
  for (const time of [0.5, 1.5]) {
    await rootExportPreview.evaluate((time) => {
      const player = (
        window as unknown as { __player: { pause(): void; seek(time: number): void } }
      ).__player;
      player.pause();
      player.seek(time);
    }, time);
    await rootExportPreview.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const image = join(scratch, `root-caption-${time}.png`);
    await rootExportPreview.screenshot({ path: image });
    const preview = (await pixels(image)).text;
    const exported = (await pixels(rootVideo, time)).text;
    assert.ok(preview.count > 50 && exported.count > 50);
    for (const edge of ["left", "top", "right", "bottom"] as const)
      assert.ok(
        Math.abs(preview[edge] - exported[edge]) <= 3,
        `root caption ${time}s ${edge} differs between preview/export`,
      );
    rootExportEvidence.push({ time, preview, exported });
  }
  await writeFile(
    join(outputs, "root-caption-export.json"),
    JSON.stringify({ status: "passed", frames: rootExportEvidence }, null, 2),
  );
  await writeFile(join(outputs, "root-caption.mp4"), await readFile(rootVideo));
  console.log(
    "PASS: native root narration export pixels match both original and gesture-edited cuts",
  );
  assert.equal(rootGestures.identity, true, "selected caption node survives isolation");
  assert.deepEqual(errors, [], "native root caption editing must not raise browser errors");
} catch (error) {
  const page = (await browser?.pages())?.at(-1);
  if (page) {
    console.log(
      "FAILURE",
      await page.evaluate(() => document.body.innerText).catch(() => "unavailable"),
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
  await drainBrowserPool();
  await closeThumbnailBrowser();
  await rm(scratch, { recursive: true, force: true });
}
