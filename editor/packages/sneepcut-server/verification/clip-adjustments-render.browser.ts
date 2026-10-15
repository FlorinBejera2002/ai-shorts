import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { findSystemChrome } from "../src/browser";
import { injectVideoFramesBatch } from "../../engine/src/services/screenshotService";

const require = createRequire(resolve("editor/packages/sneepcut-server/package.json"));
const puppeteer = require("puppeteer-core");
const helper = await readFile("editor/packages/studio/src/utils/clipAdjustments.ts", "utf8");
const code = new Bun.Transpiler({ loader: "ts" }).transformSync(helper);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const browser = await puppeteer.launch({ executablePath: findSystemChrome(), headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 200, deviceScaleFactor: 1 });
  const frame = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    for (let x = 0; x < 320; x++) {
      const level = 80 + 70 * (0.5 + 0.5 * Math.sin((x * Math.PI) / 8));
      context.fillStyle = `rgb(${level},${level * 0.6},${level * 0.4})`;
      context.fillRect(x, 0, 1, 180);
    }
    return canvas.toDataURL("image/png");
  });
  const original =
    '<!doctype html><html><body style="margin:0"><div id="source-scene-1" style="position:relative;width:320px;height:200px"><video id="source-scene-1-video" class="source-video" data-start="0" data-duration="1" style="position:absolute;left:0;top:0;width:320px;height:180px"></video><p id="caption" style="position:absolute;top:180px;left:0;width:320px;height:20px;margin:0;background:rgb(60,70,80);color:white;font:16px Arial">Unchanged captions</p></div></body></html>';
  const capture = async (html: string) => {
    await page.setContent(html);
    const injected = await injectVideoFramesBatch(page, [
      { videoId: "source-scene-1-video", dataUri: frame },
    ]);
    if (injected.length !== 1) throw new Error("Renderer did not inject the decoded frame.");
    return await page.screenshot({ encoding: "base64" });
  };
  const baseline = await capture(original);
  const results: Record<string, number> = {};
  for (const [property, value] of [
    ["brightness", 140],
    ["contrast", 150],
    ["saturation", 10],
    ["sharpen", 100],
  ] as const) {
    const changed = await page.evaluate(
      async ({ moduleUrl, original, property, value }) => {
        const { patchClipAdjustment } = await import(moduleUrl);
        return patchClipAdjustment(original, property, value);
      },
      { moduleUrl, original, property, value },
    );
    const rendered = await capture(changed);
    const difference = await page.evaluate(
      async ({ baseline, rendered }) => {
        async function pixels(data: string) {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 200;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, 320, 200).data;
        }
        const a = await pixels(baseline),
          b = await pixels(rendered);
        let video = 0,
          caption = 0;
        for (let index = 0; index < a.length; index += 4) {
          const diff =
            Math.abs(a[index] - b[index]) +
            Math.abs(a[index + 1] - b[index + 1]) +
            Math.abs(a[index + 2] - b[index + 2]);
          if (diff > 2) {
            if (index < 320 * 180 * 4) video++;
            else caption++;
          }
        }
        return { video, caption };
      },
      { baseline, rendered },
    );
    if (difference.video < 500 || difference.caption !== 0)
      throw new Error(`${property}: ${JSON.stringify(difference)}`);
    results[property] = difference.video;
  }
  console.log(
    JSON.stringify({
      verified:
        "Chromium renderer frame injection preserves all four visual filters and leaves caption pixels unchanged",
      changedVideoPixels: results,
    }),
  );
} finally {
  await browser.close();
}
