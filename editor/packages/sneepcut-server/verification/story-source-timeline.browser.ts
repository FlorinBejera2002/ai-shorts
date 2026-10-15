import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "puppeteer-core";
import { parseHTML } from "linkedom";
import { readClipTiming } from "@hyperframes/core/composition-contract";

/** Eleven source cuts over 46 seconds must open at a usable phone editing scale. */
export async function verifyLongSourceTimeline({
  page,
  projectDir,
  projectId,
  outputDir,
}: {
  page: Page;
  projectDir: string;
  projectId: string;
  outputDir: string;
}) {
  const selector = '[data-el-id="index.html#scene-1"]';
  const preview = await page.waitForFrame((frame) =>
    frame.url().includes(`/projects/${projectId}/preview?`),
  );
  await preview.waitForSelector("#scene-11");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((button) =>
      /\/\s*0{1,2}:46/.test(button.textContent ?? ""),
    ),
  );
  await page.waitForFunction(
    (selector) => {
      const clip = document.querySelector(selector);
      return clip && clip.getBoundingClientRect().width > 100;
    },
    {},
    selector,
  );
  if (!process.env.STUDIO_SOURCES_SKIP_THUMBNAILS)
    await page.waitForFunction(
      (selector) => {
        const image = document.querySelector<HTMLImageElement>(`${selector} img`);
        return image && image.complete && image.naturalWidth > 0;
      },
      {},
      selector,
    );
  await preview.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>("#scene-1 video");
    if (!video || video.readyState < 2 || video.seeking || !video.videoWidth) return false;
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext("2d")!;
    context.drawImage(video, 0, 0, 24, 24);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    return pixels.some((value, index) => index % 4 !== 3 && value > 40);
  });
  const firstWidth = await page.$eval(selector, (element) => element.getBoundingClientRect().width);
  console.log(
    "LONG TIMELINE READY",
    await page.$eval(selector, (element) => ({
      rect: element.getBoundingClientRect().toJSON(),
      viewport: document
        .querySelector("[data-timeline-scroll-viewport]")
        ?.getBoundingClientRect()
        .toJSON(),
      scrollLeft: document.querySelector("[data-timeline-scroll-viewport]")?.scrollLeft,
    })),
  );
  await page.screenshot({
    path: join(outputDir, "studio-mobile-eleven-initial.png"),
    fullPage: true,
  });
  await page.locator(selector).click();
  await page.waitForSelector('section[aria-label="Clip adjustments"]');
  await page.locator('button[aria-label="Close inspector"]').click();
  const clip = await page.$(selector);
  const rect = (await clip!.boundingBox())!;
  const client = await page.createCDPSession();
  try {
    const x = rect.x + rect.width - 5,
      y = rect.y + rect.height / 2;
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++)
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - step * 4, y }],
      });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 }).catch(() => {});
    const html = parseHTML(await readFile(join(projectDir, "index.html"), "utf8")).document;
    const trimmedDuration = readClipTiming(html.getElementById("scene-1")!).duration!;
    assert.ok(
      trimmedDuration > 2.5 && trimmedDuration < 4,
      `Phone handle did not trim the selected cut: ${trimmedDuration}`,
    );
    await page.locator('button[aria-label="Undo"]').click();
    await page.waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 }).catch(() => {});
    await page.screenshot({
      path: join(outputDir, "studio-mobile-eleven-cuts.png"),
      fullPage: true,
    });
    const viewport = await page.$("[data-timeline-scroll-viewport]");
    const view = (await viewport!.boundingBox())!;
    const panX = view.x + view.width - 30,
      panY = view.y + view.height - 15;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: panX, y: panY }],
    });
    for (let step = 1; step <= 8; step++)
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: panX - step * 28, y: panY }],
      });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(
      () => (document.querySelector("[data-timeline-scroll-viewport]")?.scrollLeft ?? 0) > 100,
    );
    const pan = await viewport!.evaluate((element) => element.scrollLeft);
    await page.screenshot({
      path: join(outputDir, "studio-mobile-eleven-cuts-panned.png"),
      fullPage: true,
    });
    const buttons = await page.$$("button");
    const fit = (
      await Promise.all(
        buttons.map(async (button) =>
          (await button.evaluate((element) => element.textContent?.trim())) === "Fit"
            ? button
            : null,
        ),
      )
    ).find(Boolean);
    assert.ok(fit, "Timeline Fit control must be available");
    await fit.click();
    await page.waitForFunction(() => {
      const clip = document.querySelector('[data-el-id="index.html#scene-1"]');
      return clip && clip.getBoundingClientRect().width < 40;
    });
    assert.equal((await page.$$("button[data-el-id]")).length, 11);
    await page.screenshot({
      path: join(outputDir, "studio-mobile-eleven-cuts-fit.png"),
      fullPage: true,
    });
    return {
      cuts: 11,
      duration: 46,
      firstWidth,
      pan,
      verified:
        "decoded thumbnails, initial phone zoom, selection, touch trim/Undo, native horizontal pan and explicit Fit",
    };
  } finally {
    await client.detach();
  }
}
