import type { Hono } from "hono";
import type { StudioApiAdapter } from "@hyperframes/studio-server";
import { thumbnailDeviceScaleFactor, getElementScreenshotClip } from "@hyperframes/studio-server";
import { findSystemChrome } from "./browser";
import { seekThumbnailPreview } from "../../studio/vite.thumbnail";
import { createStudioDevRenderBodyScripts } from "../../studio/vite.studioMotion";
import { bundledGsap } from "./assets";

type Options = Parameters<NonNullable<StudioApiAdapter["generateThumbnail"]>>[0];

/** Browser requests are answered in-process; no session credentials or public listener. */
export async function captureThumbnail(app: Hono, options: Options): Promise<Buffer | null> {
  const executablePath = findSystemChrome();
  if (!executablePath) return null;
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.default.launch({
    executablePath,
    headless: true,
    timeout: 15000,
    protocolTimeout: 15000,
    args: [
      "--disable-dev-shm-usage",
      ...(process.env.SNEEPCUT_SANDBOX_CHILD === "1" ? ["--no-sandbox"] : []),
    ],
  });
  const close = () => {
    void browser.close();
  };
  options.signal.addEventListener("abort", close, { once: true });
  try {
    if (options.signal.aborted) return null;
    const page = await browser.newPage();
    await page.setViewport({
      width: options.width,
      height: options.height,
      deviceScaleFactor: thumbnailDeviceScaleFactor(options),
    });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void (async () => {
        const url = new URL(request.url());
        if (
          url.hostname === "cdn.jsdelivr.net" &&
          /^\/npm\/gsap@[\d.]+\/dist\//.test(url.pathname)
        ) {
          const library = bundledGsap(url.pathname.split("/").pop() ?? "");
          if (library) {
            await request.respond({ status: 200, contentType: "text/javascript", body: library });
            return;
          }
        }
        if (["data:", "blob:"].includes(url.protocol)) {
          await request.continue();
          return;
        }
        if (
          url.origin !== "http://sneepcut-preview.invalid" ||
          request.method() !== "GET" ||
          !url.pathname.startsWith("/api/")
        ) {
          await request.abort();
          return;
        }
        if (
          !url.pathname.startsWith(`/api/projects/${options.project.id}/preview`) &&
          url.pathname !== "/api/runtime.js"
        ) {
          await request.abort();
          return;
        }
        const response = await app.fetch(new Request(url, { headers: request.headers() }));
        await request.respond({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        });
      })().catch(() => {
        void request.abort().catch(() => {});
      });
    });
    const preview = new URL(options.previewUrl);
    preview.host = "sneepcut-preview.invalid";
    preview.protocol = "http:";
    preview.port = "";
    await page.goto(preview.href, { waitUntil: "networkidle0", timeout: 30000 });
    for (const script of createStudioDevRenderBodyScripts(options.project.dir, {
      activeCompositionPath: options.compPath,
    }))
      await page.addScriptTag({ content: script });
    await seekThumbnailPreview(page, options.seekTime);
    const clip = options.selector
      ? await page.evaluate(getElementScreenshotClip, options.selector, options.selectorIndex)
      : undefined;
    const screenshot = await page.screenshot({ type: options.format ?? "jpeg", clip });
    return Buffer.from(screenshot);
  } finally {
    options.signal.removeEventListener("abort", close);
    await browser.close();
  }
}
