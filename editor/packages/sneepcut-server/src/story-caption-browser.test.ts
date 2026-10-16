import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import puppeteer from "puppeteer-core";
import { storyCaptionMarkup } from "./story-caption-import";
import { bundledGsap } from "./assets";

const chrome = process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browserTest = existsSync(chrome) ? test : test.skip;
const version = (preset: string, overrides = {}) => ({
  render_options: {
    caption_mode: "all",
    caption_style: { preset, size: 0.1, font_id: "builtin:inter", ...overrides },
  },
  timeline: [
    {
      audio: {},
      words: [
        { text: "Hello", start: 0, end: 0.5 },
        { text: "world", start: 0.5, end: 1 },
      ],
    },
  ],
});

browserTest(
  "native subtitle pixels respond to animations, rounded highlights and independent Off",
  async () => {
    const scratchRoot = resolve(import.meta.dir, "../../../../.cache/tmp");
    await mkdir(scratchRoot, { recursive: true });
    const scratch = await mkdtemp(join(scratchRoot, "caption-browser-"));
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    try {
      browser = await puppeteer.launch({
        executablePath: chrome,
        headless: true,
        userDataDir: join(scratch, "profile"),
        args: ["--no-sandbox", "--disable-gpu"],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 640, height: 360 });
      const gsap = bundledGsap("gsap.min.js")!.toString("utf8");
      const show = async (preset: string, overrides = {}) => {
        const markup = storyCaptionMarkup(version(preset, overrides), { width: 640, height: 360 });
        await page.setContent(
          `<html><head><style>body{margin:0;background:#333}${markup.css.replace(/@font-face\{[^}]*\}/, "")}</style></head><body>${markup.html}<script>${gsap}</script><script>window.__timelines={main:gsap.timeline({paused:true})};${markup.animation}</script></body></html>`,
        );
      };
      const seek = async (time: number) =>
        page.evaluate((time) => {
          const scope = window as unknown as {
            __timelines: { main: { seek: (time: number) => void } };
          };
          scope.__timelines.main.seek(time);
        }, time);
      const bounds = async () =>
        page.$eval(".story-caption-text", (node) => {
          const box = node.getBoundingClientRect();
          return { width: box.width, height: box.height };
        });
      await show("phrase-pop");
      await seek(0.001);
      const before = await bounds();
      const first = await page.screenshot();
      await seek(0.15);
      const after = await bounds();
      const last = await page.screenshot();
      expect(after.width / before.width).toBeGreaterThan(1.12);
      expect(after.height / before.height).toBeGreaterThan(1.12);
      expect(Buffer.compare(first, last)).not.toBe(0);

      await show("classic", { animation: "word-pop" });
      await seek(0.501);
      const initial = await page.$eval(
        "#story-caption-1-word-2",
        (node) => node.getBoundingClientRect().width,
      );
      const hidden = await page.screenshot();
      await seek(0.7);
      const enlarged = await page.$eval(
        "#story-caption-1-word-2",
        (node) => node.getBoundingClientRect().width,
      );
      expect(enlarged / initial).toBeGreaterThan(1.2);
      expect(Buffer.compare(hidden, await page.screenshot())).not.toBe(0);

      await show("active-background");
      const highlight = await page.$eval(".story-caption-active", (node) => {
        const s = getComputedStyle(node);
        return {
          radius: parseFloat(s.borderRadius),
          left: parseFloat(s.paddingLeft),
          right: parseFloat(s.paddingRight),
        };
      });
      expect(highlight.radius).toBeGreaterThan(0);
      expect(highlight.left).toBeGreaterThan(0);
      expect(highlight.right).toBe(highlight.left);
      await show("bold-outline", { outline_enabled: false });
      expect(
        await page.$eval(".story-caption", (node) => getComputedStyle(node).webkitTextStrokeWidth),
      ).toBe("0px");
      await show("contrast-box", { background_enabled: false });
      expect(
        await page.$eval(".story-caption-text", (node) => getComputedStyle(node).backgroundColor),
      ).toBe("rgba(0, 0, 0, 0)");
      await show("active-background", { active_word_enabled: false });
      expect(await page.$(".story-caption-active")).toBeNull();

      // Exercise the exact HTML patch saved by Studio, then reload it as export does.
      const built = await Bun.build({
        entrypoints: [resolve(import.meta.dir, "../../studio/src/utils/sourceCutCaptions.ts")],
        target: "browser",
      });
      expect(built.success).toBe(true);
      const module = await built.outputs[0]!.text();
      const source = storyCaptionMarkup(
        version("phrase-pop", {
          outline: 3,
          outline_color: "#123456",
          background_opacity: 0.7,
          background_color: "#112233",
        }),
        { width: 640, height: 360 },
      );
      const authored = `<html><head><style>${source.css.replace(/@font-face\{[^}]*\}/, "")}</style></head><body><div data-composition-id="main">${source.html}</div><script>${gsap}</script><script>window.__timelines={main:gsap.timeline({paused:true})};${source.animation}</script></body></html>`;
      const patched = await page.evaluate(
        async ({ source, module }) => {
          const url = URL.createObjectURL(new Blob([module], { type: "text/javascript" }));
          try {
            const patch = await import(url);
            let html = patch.patchSourceCaptions(source, "size", 90);
            html = patch.patchSourceCaptions(html, "outline", false);
            html = patch.patchSourceCaptions(html, "background", false);
            return patch.patchSourceCaptions(html, "animation", "word-pop");
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { source: authored, module },
      );
      await page.setContent(patched);
      expect(await page.$eval(".story-caption", (node) => getComputedStyle(node).fontSize)).toBe(
        "90px",
      );
      expect(
        await page.$eval(".story-caption", (node) => getComputedStyle(node).webkitTextStrokeWidth),
      ).toBe("0px");
      expect(
        await page.$eval("[data-caption-text]", (node) => getComputedStyle(node).backgroundColor),
      ).toBe("rgba(0, 0, 0, 0)");
      await seek(0.501);
      const savedBefore = await page.$eval(
        "#story-caption-1-word-2",
        (node) => node.getBoundingClientRect().width,
      );
      await seek(0.7);
      const savedAfter = await page.$eval(
        "#story-caption-1-word-2",
        (node) => node.getBoundingClientRect().width,
      );
      expect(savedAfter / savedBefore).toBeGreaterThan(1.2);

      const rootBundle = await Bun.build({
        entrypoints: [resolve(import.meta.dir, "../../studio/src/utils/rootCaptionEdit.ts")],
        target: "browser",
      });
      expect(rootBundle.success).toBe(true);
      const rootModule = await rootBundle.outputs[0]!.text();
      const rootSource = authored.replace(
        "<body>",
        '<body><div data-source-window id="cut-1" data-composition-src="source-scene-1.html" data-start="0" data-duration="0.5"></div><div data-source-window id="cut-2" data-composition-src="source-scene-2.html" data-start="0.5" data-duration="0.5"></div>',
      );
      await page.setContent(rootSource);
      const isolated = await page.evaluate(
        async ({ module, html }) => {
          const url = URL.createObjectURL(new Blob([module], { type: "text/javascript" }));
          try {
            const editor = await import(url);
            const element = document.getElementById("story-caption-1")!;
            const selection = { element, id: element.id, sourceFile: "index.html" };
            const result = editor.planRootCaptionEdit(
              html,
              selection,
              [{ type: "inline-style", property: "font-size", value: "90px" }],
              0.7,
            );
            element.style.fontSize = "90px";
            editor.syncRootCaptionEdit(selection, result, "index.html");
            const clone = document.querySelector<HTMLElement>("[data-caption-split-origin]")!;
            return {
              sameNode: document.getElementById(element.id) === element,
              start: element.getAttribute("data-start"),
              selectedSize: getComputedStyle(element).fontSize,
              neighbourSize: getComputedStyle(clone).fontSize,
              wordStart: element
                .querySelector("[data-caption-word-start]")
                ?.getAttribute("data-caption-word-start"),
            };
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { module: rootModule, html: rootSource },
      );
      expect(isolated).toEqual({
        sameNode: true,
        start: "0.5",
        selectedSize: "90px",
        neighbourSize: "36px",
        wordStart: "0",
      });
    } finally {
      await browser?.close();
      if (scratch.startsWith(join(scratchRoot, "caption-browser-")))
        await rm(scratch, { recursive: true, force: true });
    }
  },
  30000,
);
