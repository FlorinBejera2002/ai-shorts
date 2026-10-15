import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page, Frame } from "puppeteer-core";
import { parseHTML } from "linkedom";

export async function verifySourceSfx({
  page,
  preview,
  projectDir,
}: {
  page: Page;
  preview: Frame;
  projectDir: string;
}) {
  const source = async (number: number) =>
    parseHTML(await readFile(join(projectDir, `source-scene-${number}.html`), "utf8")).document;
  const effect = async (number: number) =>
    (await source(number)).querySelector("audio[data-cut-sfx]");
  const wait = async (condition: () => Promise<boolean>) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await condition()) {
        await page
          .waitForNetworkIdle({ concurrency: 2, idleTime: 500, timeout: 5000 })
          .catch(() => {});
        return;
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error("Cut sound effect was not persisted");
  };
  const open = async () => {
    if (!(await page.$('button[aria-label="Inspector"][aria-pressed="true"]')))
      await page.locator('button[aria-label="Inspector"]').click();
    await page.locator('[data-el-id="index.html#scene-1"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-el-id="index.html#scene-1"]')
          ?.getAttribute("aria-pressed") === "true",
    );
    await page.waitForSelector('section[aria-label="Cut sound effect"]');
  };
  const click = async (label: string) => {
    const buttons = await page.$$('section[aria-label="Cut sound effect"] button');
    for (const button of buttons) {
      if ((await button.evaluate((element) => element.textContent?.trim())) !== label) continue;
      await page.waitForFunction((button) => !(button as HTMLButtonElement).disabled, {}, button);
      await button.click();
      return;
    }
    throw new Error(`Missing sound effect action: ${label}`);
  };
  await open();
  await page.select('select[aria-label="Cut sound"]', "whoosh");
  // Observe the real browser audio created by Listen without changing playback.
  await page.evaluate(() => {
    const fixture = window as unknown as {
      soundAudition?: { ready: number; src: string; volume: number };
    };
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const result = original.call(this);
      void result
        .then(() => {
          fixture.soundAudition = {
            ready: this.readyState,
            src: this.currentSrc,
            volume: this.volume,
          };
        })
        .catch(() => {});
      HTMLMediaElement.prototype.play = original;
      return result;
    };
  });
  await click("Listen");
  await page.waitForFunction(() => {
    const result = (window as unknown as { soundAudition?: { ready: number; src: string } })
      .soundAudition;
    return result && result.ready >= 2 && result.src.startsWith("blob:");
  });
  await click("Apply to selected cut");
  await wait(async () => (await effect(1))?.getAttribute("data-cut-sfx") === "whoosh");
  assert.equal(await effect(2), null, "Selected effect must not affect another cut");
  const selected = (await effect(1))!;
  assert.ok(selected.hasAttribute("data-cut-boundary"));
  assert.equal(selected.getAttribute("data-start"), "0");
  assert.equal(selected.getAttribute("data-media-start"), "0");
  const wav = await readFile(join(projectDir, selected.getAttribute("src")!));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.ok(wav.subarray(44).some((byte) => byte !== 0));
  await open();
  await click("Apply to all cuts");
  await wait(async () => (await effect(2))?.getAttribute("data-cut-sfx") === "whoosh");
  await page.locator('button[aria-label="Close inspector"]').click();
  await page.locator('button[aria-label="Undo"]').click();
  await wait(async () => (await effect(2)) === null);
  assert.ok(await effect(1), "Undo all-cuts must retain the previously selected effect");
  await page.locator('button[aria-label="Redo"]').click();
  await wait(async () => (await effect(2))?.getAttribute("data-cut-sfx") === "whoosh");
  const frame = page.frames().find((item) => item.url().includes("/preview?")) ?? preview;
  await frame.waitForFunction(() => {
    const effect = document.querySelector("audio[data-cut-sfx]");
    return effect?.hasAttribute("data-source-window-projected");
  });
  const projected = await frame.evaluate(() =>
    [...document.querySelectorAll("audio[data-cut-sfx]")].map((audio) => ({
      start: audio.getAttribute("data-start"),
      source: audio.getAttribute("data-media-start"),
      rate: audio.getAttribute("data-playback-rate"),
      hidden: audio.hasAttribute("data-hidden"),
    })),
  );
  assert.equal(projected.length, 2);
  for (const effect of projected)
    assert.deepEqual(effect, { start: "0", source: "0", rate: "1", hidden: false });
  await open();
  await click("Remove from all cuts");
  await wait(async () => !(await effect(1)) && !(await effect(2)));
  await page.locator('button[aria-label="Close inspector"]').click();
  return {
    verified:
      "audible browser audition, selected/all cut effects, real WAV asset, cut-local timing, Undo/Redo and removal",
  };
}
