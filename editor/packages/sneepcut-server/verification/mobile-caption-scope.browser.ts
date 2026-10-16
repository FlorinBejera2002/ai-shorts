import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "puppeteer-core";
import { storyCaptionMarkup } from "../src/story-caption-import";

export async function createRootCaptionFixture(directory: string) {
  await mkdir(join(directory, "assets"), { recursive: true });
  await writeFile(
    join(directory, "assets/caption-font.ttf"),
    await readFile(
      join(import.meta.dir, "../../../../backend/internal/captions/assets/inter-700.ttf"),
    ),
  );
  const caption = storyCaptionMarkup(
    {
      render_options: {
        caption_mode: "all",
        caption_style: {
          preset: "classic",
          animation: process.env.STUDIO_ROOT_CAPTION_ANIMATION ?? "none",
          size: 0.1,
          position: { x: 0.5, y: 0.65 },
          outline: 0,
          shadow: 0,
        },
      },
      timeline: [
        {
          audio: {},
          words: [
            { text: "Two", start: 0, end: 1 },
            { text: "words", start: 1, end: 2 },
          ],
        },
      ],
    },
    { width: 360, height: 640 },
  );
  const source = `<!doctype html><html><head><script src="vendor/gsap.min.js"></script></head><body><div id="source-scene-1" data-composition-id="source-scene-1" data-width="360" data-height="640" data-duration="2" style="width:360px;height:640px;background:#233448"></div><script>const tl=gsap.timeline({paused:true});tl.to({}, {duration:2},0);window.__timelines["source-scene-1"]=tl;</script></body></html>`;
  await writeFile(join(directory, "source-scene-1.html"), source);
  const hosts = [0, 1]
    .map(
      (start) =>
        `<div id="scene-${start + 1}" class="clip" data-start="${start}" data-duration="1" data-track-index="0" data-source-window data-playback-start="${start}" data-composition-id="source-scene-1" data-composition-src="source-scene-1.html"></div>`,
    )
    .join("");
  const css = caption.css;
  await writeFile(
    join(directory, "index.html"),
    `<!doctype html><html><head><script src="vendor/gsap.min.js"></script><style>body{margin:0}#main{position:relative;width:360px;height:640px;background:#233448}.clip{position:absolute;inset:0}${css}</style></head><body><div id="main" data-composition-id="main" data-width="360" data-height="640" data-duration="2">${hosts}${caption.html}</div><script>const tl=gsap.timeline({paused:true});tl.to({}, {duration:2},0);window.__timelines["main"]=tl;${caption.animation}</script></body></html>`,
  );
}

async function seek(page: Page, time: number) {
  const point = await page.evaluate((time) => {
    const first = document
      .querySelector('[data-el-id="index.html#scene-1"]')!
      .getBoundingClientRect();
    const second = document
      .querySelector('[data-el-id="index.html#scene-2"]')!
      .getBoundingClientRect();
    const ruler = document
      .querySelector('[data-timeline-grid-cell="major"]')!
      .getBoundingClientRect();
    return { x: first.x + (second.x - first.x) * time, y: ruler.y + 10 };
  }, time);
  await page.mouse.click(point.x, point.y);
}

async function captionState(page: Page) {
  const preview = await page.waitForFrame((frame) => frame.url().includes("/preview?"));
  return preview.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".story-caption")].map((element) => ({
      id: element.id,
      font: parseFloat(getComputedStyle(element).fontSize),
      start: Number(element.getAttribute("data-start")),
      duration: Number(element.getAttribute("data-duration")),
      box: element.getBoundingClientRect().toJSON(),
      identity: Reflect.get(window, "__captionGestureIdentity") === element,
      wordTops: [...element.querySelectorAll(".story-caption-word")].map(
        (word) => word.getBoundingClientRect().top,
      ),
      style: element.getAttribute("style"),
      fontBase: element.getAttribute("data-hf-studio-resize-font-base"),
      widthBase: element.getAttribute("data-hf-studio-original-box-width"),
      words: [...element.querySelectorAll(".story-caption-word")].map((word) => ({
        text: word.textContent,
        width: word.getBoundingClientRect().width,
      })),
      textStyle: (() => {
        const text = element.querySelector<HTMLElement>(".story-caption-text")!;
        const style = getComputedStyle(text);
        return {
          width: style.width,
          padding: style.padding,
          boxSizing: style.boxSizing,
          letterSpacing: style.letterSpacing,
          wordSpacing: style.wordSpacing,
          font: style.fontSize,
        };
      })(),
      runtime: {
        gsap: Boolean(Reflect.get(window, "gsap")),
        rebind: typeof Reflect.get(window, "__hfForceTimelineRebind"),
      },
    })),
  );
}

export async function verifyRootCaptionGestures({
  page,
  url,
  directory,
  outputs,
  pinch,
  drag,
  waitIdle,
}: {
  page: Page;
  url: string;
  directory: string;
  outputs: string;
  pinch: (page: Page, scale: number) => Promise<void>;
  drag: (page: Page, x: number, y: number) => Promise<void>;
  waitIdle: (page: Page) => Promise<void>;
}) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const selector = '[data-el-id="index.html#story-caption-1"]';
  await page.waitForSelector(selector);
  await page.locator(selector).click();
  await waitIdle(page);
  await seek(page, 1.5);
  await waitIdle(page);
  const preview = await page.waitForFrame((frame) => frame.url().includes("/preview?"));
  await preview.evaluate(() =>
    Reflect.set(window, "__captionGestureIdentity", document.getElementById("story-caption-1")),
  );
  const before = await captionState(page);
  assert.equal(before[0]!.font, 36);
  await pinch(page, 1.4);
  const after = await captionState(page);
  const selected = after.find((cue) => cue.id === "story-caption-1")!;
  const neighbour = after.find((cue) => cue.id !== "story-caption-1")!;
  assert.equal(after.length, 2, "cross-cut root narration splits only at the selected cut");
  assert.equal(selected.start, 1);
  assert.equal(selected.duration, 1);
  assert.equal(neighbour.start, 0);
  assert.equal(neighbour.duration, 1);
  assert.equal(neighbour.font, 36, "previous cut keeps its original subtitle size");
  assert.ok(selected.font > 48, "selected cut subtitle glyphs grow");
  await writeFile(
    join(outputs, "root-caption-after-pinch.json"),
    JSON.stringify({ before, after }, null, 2),
  );
  await writeFile(
    join(outputs, "root-caption-source.html"),
    await readFile(join(directory, "index.html")),
  );
  assert.ok(
    Math.max(...selected.wordTops) - Math.min(...selected.wordTops) < 1,
    "pinch preserves the phrase on one line",
  );
  await page.locator('button[aria-label="Undo"]').click();
  await waitIdle(page);
  const undone = await captionState(page);
  assert.equal(undone.length, 1, "one undo restores the whole cross-cut cue");
  assert.equal(undone[0]!.font, 36);
  await page.locator('button[aria-label="Redo"]').click();
  await waitIdle(page);
  await page.locator(selector).click();
  await seek(page, 1.5);
  await waitIdle(page);
  const redone = await captionState(page);
  assert.equal(redone.find((cue) => cue.id === "story-caption-1")!.font, selected.font);
  await drag(page, 6, -12);
  const dragged = await captionState(page);
  assert.ok(
    dragged.find((cue) => cue.id === "story-caption-1")!.box.y < selected.box.y - 10,
    "drag moves selected root caption",
  );
  assert.equal(dragged.find((cue) => cue.id !== "story-caption-1")!.font, 36);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(selector);
  await waitIdle(page);
  await page.locator(selector).click();
  await seek(page, 1.5);
  await waitIdle(page);
  const reloaded = await captionState(page);
  const saved = reloaded.find((cue) => cue.id === "story-caption-1")!;
  const moved = dragged.find((cue) => cue.id === "story-caption-1")!;
  assert.equal(saved.font, selected.font);
  assert.ok(
    Math.abs(saved.box.x - moved.box.x) < 0.1 && Math.abs(saved.box.y - moved.box.y) < 0.1,
    "selected root caption geometry survives reload",
  );
  assert.equal(reloaded.find((cue) => cue.id !== "story-caption-1")!.font, 36);
  await page.screenshot({ path: join(outputs, "root-caption-mobile.png") });
  await writeFile(
    join(outputs, "root-caption-source.html"),
    await readFile(join(directory, "index.html")),
  );
  await writeFile(
    join(outputs, "root-caption-summary.json"),
    JSON.stringify(
      {
        status: selected.identity ? "passed" : "identity-failed",
        before,
        after,
        undone,
        redone,
        dragged,
        reloaded,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: real native root caption pinch/drag isolated to selected cut, one-step Undo/Redo and reload",
  );
  return { identity: selected.identity };
}
