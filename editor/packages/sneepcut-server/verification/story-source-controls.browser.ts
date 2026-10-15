import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface BrowserFixture {
  page: any;
  preview: any;
  projectDir: string;
  outputDir?: string;
}

/** Exercises the actual imported-source inspector and its durable undo history. */
export async function verifySourceControls({
  page,
  preview,
  projectDir,
  outputDir,
}: BrowserFixture) {
  const source = (number: number) =>
    readFile(join(projectDir, `source-scene-${number}.html`), "utf8");
  const wait = async (check: () => Promise<boolean>, description: string) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (await check()) {
        await page
          .waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 })
          .catch(() => {});
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${description}`);
  };
  const frame = () =>
    page.frames().find((item: any) => item.url().includes("/preview?")) ?? preview;
  const attr = async (number: number, name: string) =>
    (await source(number)).match(new RegExp(`${name}="([^"]*)"`))?.[1];
  const open = async () => {
    if (!(await page.$('button[aria-label="Inspector"][aria-pressed="true"]')))
      await page.locator('button[aria-label="Inspector"]').click();
    if (process.env.STUDIO_SOURCES_DEBUG)
      console.log(
        "CLICK TARGET",
        await page.$eval('[data-el-id="index.html#scene-1"]', (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          return {
            rect: rect.toJSON(),
            target: document
              .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
              ?.outerHTML.slice(0, 500),
          };
        }),
      );
    await page.locator('button[data-el-id="index.html#scene-1"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-el-id="index.html#scene-1"]')
          ?.getAttribute("aria-pressed") === "true",
    );
    await page
      .waitForSelector('section[aria-label="Clip adjustments"] input[type="range"]', {
        timeout: 5000,
      })
      .catch(async (error: Error) => {
        console.log("INSPECTOR", await page.evaluate(() => document.body.innerText));
        if (outputDir)
          await page.screenshot({
            path: join(outputDir, "studio-adjustments-missing.png"),
            fullPage: true,
          });
        throw error;
      });
  };
  const close = async () => {
    const button = await page.$('button[aria-label="Close inspector"]');
    if (button) await page.locator('button[aria-label="Close inspector"]').click();
  };
  const change = async (label: string, value: number) => {
    console.log("CONTROL", label, value);
    await page
      .waitForFunction(
        (text: string) => {
          const label = [
            ...document.querySelectorAll<HTMLLabelElement>(
              'section[aria-label="Clip adjustments"] label',
            ),
          ].find((item) => item.textContent === text);
          return label && !(document.getElementById(label.htmlFor) as HTMLInputElement)?.disabled;
        },
        {},
        label,
      )
      .catch(async (error: Error) => {
        console.log("CONTROL MISSING", await page.evaluate(() => document.body.innerText));
        console.log(
          "SOURCE HOSTS",
          await frame().evaluate(() =>
            [...document.querySelectorAll("[data-source-window]")].map((element) =>
              element.outerHTML.slice(0, 700),
            ),
          ),
        );
        throw error;
      });
    await page.evaluate(
      ({ label, value }: { label: string; value: number }) => {
        const element = [
          ...document.querySelectorAll<HTMLLabelElement>(
            'section[aria-label="Clip adjustments"] label',
          ),
        ].find((item) => item.textContent === label)!;
        const input = document.getElementById(element.htmlFor) as HTMLInputElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          String(value),
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      },
      { label, value },
    );
  };
  const all = async (label: string) => {
    console.log("ALL CUTS", label);
    const selector = `button[aria-label="Apply ${label.toLowerCase()} to all cuts"]`;
    await page
      .waitForFunction(
        (selector: string) => {
          const button = document.querySelector<HTMLButtonElement>(selector);
          return button && !button.disabled;
        },
        { timeout: 5000 },
        selector,
      )
      .catch(async (error: Error) => {
        console.log("CONTROL STATE", await page.evaluate(() => document.body.innerText));
        throw error;
      });
    await page.locator(selector).click();
  };
  const decodedScreenshot = async (expectedSharpen: number) => {
    await close();
    const current = frame();
    await current.waitForFunction(
      (sharpen: number) => {
        const video = document.querySelector("video");
        return (
          video &&
          video.readyState >= 2 &&
          !video.seeking &&
          video.getAttribute("data-cut-saturation") === "70" &&
          Number(video.getAttribute("data-cut-sharpen") ?? 0) === sharpen
        );
      },
      {},
      expectedSharpen,
    );
    await current.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const video = await current.$("video");
    const image = await video.screenshot({ encoding: "base64" });
    return {
      image,
      time: await video.evaluate((element: HTMLVideoElement) => element.currentTime),
    };
  };
  const pixelDifference = async (before: string, after: string) =>
    page.evaluate(
      async ({ before, after }: { before: string; after: string }) => {
        const pixels = async (base64: string) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const a = await pixels(before),
          b = await pixels(after);
        if (a.length !== b.length) throw new Error("Preview geometry changed during filter check.");
        let changed = 0;
        for (let index = 0; index < a.length; index += 4)
          if (
            Math.abs(a[index] - b[index]) +
              Math.abs(a[index + 1] - b[index + 1]) +
              Math.abs(a[index + 2] - b[index + 2]) >
            5
          )
            changed++;
        return changed;
      },
      { before, after },
    );

  await open();
  const mobile = await page.$eval(
    'section[aria-label="Clip adjustments"]',
    (element: HTMLElement) => ({
      width: element.getBoundingClientRect().width,
      viewport: window.innerWidth,
    }),
  );
  if (mobile.viewport < 640 && mobile.width < mobile.viewport - 35)
    throw new Error("Mobile clip controls are too narrow.");
  if (
    mobile.viewport < 640 &&
    !(await page.$eval('button[aria-label="Close inspector"]', (button) => {
      const rect = button.getBoundingClientRect();
      return button.contains(
        document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
      );
    }))
  )
    throw new Error("Preview controls cover the phone Inspector close button.");
  await change("Brightness", 120);
  await wait(
    async () => (await attr(1, "data-cut-brightness")) === "120",
    "selected brightness saved",
  );
  if (await attr(2, "data-cut-brightness"))
    throw new Error("Selected brightness leaked to another cut.");
  await change("Contrast", 130);
  await wait(async () => (await attr(1, "data-cut-contrast")) === "130", "selected contrast saved");
  await all("brightness");
  await wait(
    async () => (await attr(2, "data-cut-brightness")) === "120",
    "all-cut brightness saved",
  );
  if (await attr(2, "data-cut-contrast"))
    throw new Error("Apply brightness to all copied unrelated contrast.");
  await change("Saturation", 70);
  await wait(async () => (await attr(1, "data-cut-saturation")) === "70", "saturation saved");
  const beforeSharp = await decodedScreenshot(0);
  await open();
  await change("Sharpen", 65);
  await wait(async () => (await attr(1, "data-cut-sharpen")) === "65", "sharpen saved");
  const afterSharp = await decodedScreenshot(65);
  const sharpenPixels = await pixelDifference(beforeSharp.image, afterSharp.image);
  if (Math.abs(beforeSharp.time - afterSharp.time) > 0.05)
    throw new Error("Preview time changed during sharpening check.");
  if (sharpenPixels < 20) {
    console.log(
      "SHARPEN DIAGNOSTIC",
      await frame().evaluate(() => ({
        videos: [...document.querySelectorAll("video")].map((video) => ({
          time: video.currentTime,
          filter: getComputedStyle(video).filter,
          html: video.outerHTML,
        })),
        filters: [...document.querySelectorAll("filter")].map((filter) => filter.outerHTML),
      })),
    );
    if (outputDir) {
      await writeFile(
        join(outputDir, "sharpen-before.png"),
        Buffer.from(beforeSharp.image, "base64"),
      );
      await writeFile(
        join(outputDir, "sharpen-after.png"),
        Buffer.from(afterSharp.image, "base64"),
      );
    }
    throw new Error(`Sharpen did not change decoded video pixels (${sharpenPixels}).`);
  }
  const filteredCaption = await frame().evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[id*="caption"]')].some(
      (element) => getComputedStyle(element).filter !== "none",
    ),
  );
  if (filteredCaption) throw new Error("Image adjustment affected captions.");

  await open();
  await change("Clip volume", 40);
  await wait(async () => (await attr(1, "data-volume")) === "0.4", "selected volume saved");
  if (await attr(2, "data-volume")) throw new Error("Selected volume leaked to another cut.");
  await all("clip volume");
  await wait(async () => (await attr(2, "data-volume")) === "0.4", "all-cut volume saved");
  await frame().waitForFunction(() => {
    const video = document.querySelector("video");
    return video && Math.abs(video.volume - 0.4) < 0.001;
  });
  const checkbox = 'section[aria-label="Clip adjustments"] input[type="checkbox"]';
  await page.waitForFunction(
    (selector: string) => {
      const input = document.querySelector<HTMLInputElement>(selector);
      return input && !input.disabled;
    },
    {},
    checkbox,
  );
  await page.click(checkbox);
  await wait(async () => (await attr(1, "data-cut-muted")) === "true", "selected mute saved");
  await frame().waitForFunction(() => document.querySelector("video")?.muted === true);
  if (await attr(2, "data-cut-muted")) throw new Error("Selected mute leaked to another cut.");
  await close();
  await page.click('button[aria-label="Undo"]');
  await wait(async () => (await attr(1, "data-cut-muted")) !== "true", "mute undo");
  await page.click('button[aria-label="Redo"]');
  await wait(async () => (await attr(1, "data-cut-muted")) === "true", "mute redo");
  await page.click('button[aria-label="Undo"]');
  await wait(async () => (await attr(1, "data-cut-muted")) !== "true", "restore camera audio");
  await frame().waitForFunction(() => document.querySelector("video")?.muted === false);
  await open();
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    await page.screenshot({ path: join(outputDir, "studio-cut-adjustments.png"), fullPage: true });
  }
  await close();
  return {
    verified:
      "selected cut settings, property-only apply to all, persisted volume/mute, undo/redo and decoded sharpening pixels",
    sharpenPixels,
    mobileWidth: mobile.width,
  };
}
