/** Real Studio cut scope, split isolation, in-place preview, undo and reopen. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { parseHTML } from "linkedom";
import { createApp } from "../src/app";
import { findSystemChrome } from "../src/browser";
import { createUserRuntime } from "../src/runtime";
import { initializeProject } from "../src/starter";
import { ProjectStore } from "../src/store";
import { getMimeType } from "../../studio-server/src/index";
import { verifySplitCutGestures } from "./cut-gestures";

const root = resolve(import.meta.dir, "../../../..");
await mkdir(join(root, ".cache/tmp"), { recursive: true });
const scratch = await mkdtemp(join(root, ".cache/tmp/cut-settings-"));
const outputs = join(root, "frontend/test-results/cut-settings-feedback");
await mkdir(outputs, { recursive: true });
const owner = "22222222-2222-4222-8222-222222222222";
const id = "66666666-6666-4666-8666-666666666666";
const store = new ProjectStore(join(scratch, "data"));
const port = Number(process.env.STUDIO_CUT_SETTINGS_PORT ?? 5197);
const origin = `http://localhost:${port}`;
let browser: Browser | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let runtime: ReturnType<typeof createUserRuntime> | undefined;
async function idle(page: Page) {
  await page.waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 10000 }).catch(() => {});
}

try {
  const project = await store.ensure(
    owner,
    id,
    "Cut settings synthetic fixture",
    async (project) => {
      await initializeProject(project);
      const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
      const encoded = spawnSync(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "color=c=royalblue:s=180x320:r=30:d=8",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-y",
          join(project.dir, "source.mp4"),
        ],
        { encoding: "utf8" },
      );
      assert.equal(encoded.status, 0, encoded.stderr);
      await writeFile(
        join(project.dir, "source-scene-1.html"),
        `<!doctype html><html><head><script src="vendor/gsap.min.js"></script></head><body><div id="source-scene-1" data-composition-id="source-scene-1" data-width="360" data-height="640" data-duration="8" style="position:relative;width:360px;height:640px"><video id="source-scene-1-video" class="clip source-video" data-start="0" data-duration="8" data-source-duration="8" data-media-start="0" src="source.mp4" muted playsinline style="width:100%;height:100%;object-fit:cover"></video></div><script>const tl=gsap.timeline({paused:true});tl.to({}, {duration:8},0);window.__timelines["source-scene-1"]=tl;</script></body></html>`,
      );
      await writeFile(
        join(project.dir, "index.html"),
        `<!doctype html><html><head><script src="vendor/gsap.min.js"></script><style>body{margin:0}#main{position:relative;width:360px;height:640px;background:#111}.clip{position:absolute;inset:0}</style></head><body><div id="main" data-composition-id="main" data-width="360" data-height="640" data-duration="4"><div id="scene-1" class="clip" data-start="0" data-duration="2" data-track-index="0" data-source-window data-playback-start="0" data-composition-id="source-scene-1" data-composition-src="source-scene-1.html"></div><div id="scene-2" class="clip" data-start="2" data-duration="2" data-track-index="0" data-source-window data-playback-start="2" data-composition-id="source-scene-1" data-composition-src="source-scene-1.html"></div><div id="logo" style="position:absolute;top:10px;left:10px;color:white;z-index:5">Logo untouched</div></div><script>const tl=gsap.timeline({paused:true});tl.to({}, {duration:4},0);window.__timelines["main"]=tl;</script></body></html>`,
      );
    },
  );
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
  page.on("pageerror", (error) => {
    errors.push(String(error));
    console.error("CUT PAGE ERROR", String(error));
  });
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(`${origin}/health`);
  await page.evaluate(async () =>
    fetch("/sneepcut/session", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-fixture" },
    }),
  );
  await page.goto(`${origin}/#project/${id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-el-id="index.html#scene-2"]', { timeout: 60000 });
  await verifySplitCutGestures(page, project.dir, () => idle(page), outputs);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-el-id="index.html#scene-2"]', { timeout: 60000 });
  await page.locator('[data-el-id="index.html#scene-2"]').click();
  await page.waitForSelector('[aria-label="Cut fit"]');
  await idle(page);
  const preview = await page.waitForFrame((frame) => frame.url().includes("/preview?"));
  await preview.evaluate(() =>
    Reflect.set(window, "__cutScopeIdentity", document.getElementById("scene-2")),
  );
  await page.select('[aria-label="Cut fit"]', "contain");
  await idle(page);
  const parentAfter = await readFile(join(project.dir, "index.html"), "utf8");
  const parentDoc = parseHTML(parentAfter).document;
  const selectedPath = parentDoc.getElementById("scene-2")!.getAttribute("data-composition-src")!;
  assert.notEqual(selectedPath, "source-scene-1.html", "selected split forks its child file");
  assert.equal(
    parentDoc.getElementById("scene-1")!.getAttribute("data-composition-src"),
    "source-scene-1.html",
  );
  assert.match(await readFile(join(project.dir, selectedPath), "utf8"), /object-fit:\s*contain/);
  assert.match(
    await readFile(join(project.dir, "source-scene-1.html"), "utf8"),
    /object-fit:\s*cover/,
  );
  assert.equal(
    await preview.evaluate(
      () => Reflect.get(window, "__cutScopeIdentity") === document.getElementById("scene-2"),
    ),
    true,
    "cut edit must retain iframe and host identity",
  );
  await page.locator('[aria-label="Apply fit to all cuts"]').click();
  await idle(page);
  assert.match(
    await readFile(join(project.dir, "source-scene-1.html"), "utf8"),
    /object-fit:\s*contain/,
  );
  await page.locator('button[aria-label="Undo"]').click();
  await idle(page);
  assert.match(
    await readFile(join(project.dir, "source-scene-1.html"), "utf8"),
    /object-fit:\s*cover/,
  );
  assert.match(await readFile(join(project.dir, selectedPath), "utf8"), /object-fit:\s*contain/);
  await page.locator('button[aria-label="Redo"]').click();
  await idle(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-el-id="index.html#scene-2"]', { timeout: 60000 });
  const reopened = await page.waitForFrame((frame) => frame.url().includes("/preview?"));
  await reopened.waitForFunction(
    () => document.querySelectorAll("video.source-video").length === 2,
  );
  const styles = await reopened.evaluate(() =>
    [...document.querySelectorAll("video.source-video")].map(
      (video) => getComputedStyle(video).objectFit,
    ),
  );
  assert.deepEqual(styles, ["contain", "contain"]);
  assert.match(await readFile(join(project.dir, "index.html"), "utf8"), /Logo untouched/);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: join(outputs, "split-cut-reopened.png") });
  await writeFile(
    join(outputs, "summary.json"),
    JSON.stringify(
      {
        status: "passed",
        splitIsolation: true,
        dragResizeIsolation: true,
        inPlacePreview: true,
        applyAll: true,
        appearanceAndStaticLayout: true,
        undoRedo: true,
        reopen: true,
        globalOverlayUnchanged: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "CUT SETTINGS PASS: split isolation, Apply all, undo/redo, reopen and preview identity",
  );
} catch (error) {
  const page = (await browser?.pages())?.at(-1);
  if (page) {
    console.error(
      "CUT SCOPE FAILURE",
      await page.evaluate(() => document.body.innerText).catch(() => "unavailable"),
    );
    await page
      .screenshot({ path: join(outputs, "failure.png"), optimizeForSpeed: true })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  server?.stop(true);
  runtime?.close();
  assert.ok(
    resolve(scratch).startsWith(resolve(root, ".cache/tmp") + "/") ||
      resolve(scratch).startsWith(resolve(root, ".cache/tmp") + "\\"),
  );
  await rm(scratch, { recursive: true, force: true });
}
