import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Page } from "puppeteer-core";

async function preview(page: Page) {
  return page.waitForFrame((frame) => frame.url().includes("/preview?"));
}

async function geometry(page: Page) {
  const frame = await preview(page);
  return frame.evaluate(() =>
    ["scene-1", "scene-2"].map((id) => {
      const video = document.querySelector(`#${id} video`)!;
      const rect = video.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
}

async function selectVideo(page: Page, idle: () => Promise<void>) {
  const ticks = await page.$$('[data-timeline-grid-cell="major"]');
  const first = (await ticks[0].boundingBox())!;
  const second = (await ticks[1].boundingBox())!;
  await page.mouse.click(first.x + ((second.x - first.x) * 3) / 5, first.y + 10);
  await page.locator('[data-el-id="index.html#scene-2"]').click();
  await idle();
  await page.keyboard.press("Escape");
  const frame = await preview(page);
  const iframe = await frame.frameElement();
  const rect = (await iframe!.boundingBox())!;
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.waitForSelector('[data-dom-edit-selection-box="true"]');
}

function near(actual: number, expected: number, message: string) {
  assert.ok(Math.abs(actual - expected) < 1, `${message}: ${actual} versus ${expected}`);
}

async function verifyPresentationCopy(
  page: Page,
  directory: string,
  idle: () => Promise<void>,
  selectedPath: string,
) {
  const selectedBefore = await readFile(join(directory, selectedPath), "utf8");
  const parentBefore = await readFile(join(directory, "index.html"), "utf8");
  const siblingBefore = await readFile(join(directory, "source-scene-1.html"), "utf8");
  const frame = await preview(page);
  await frame.evaluate(() =>
    Reflect.set(window, "__presentationIdentity", document.getElementById("scene-2")),
  );
  await page.evaluate(() => {
    const media = [
      ...document.querySelectorAll<HTMLButtonElement>('button[data-flat-group-collapsed="true"]'),
    ].find((button) => button.textContent?.startsWith("Media"));
    media?.click();
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) =>
        button.textContent?.trim() === "Apply image styling and static layout to all cuts",
    ),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find(
        (button) =>
          button.textContent?.trim() === "Apply image styling and static layout to all cuts",
      )!
      .click(),
  );
  await frame.waitForFunction(() => {
    const first = document.querySelector("#scene-1 video")!.getBoundingClientRect();
    const second = document.querySelector("#scene-2 video")!.getBoundingClientRect();
    return ["x", "y", "width", "height"].every(
      (key) =>
        Math.abs(
          (first[key as keyof DOMRect] as number) - (second[key as keyof DOMRect] as number),
        ) < 1,
    );
  });
  await idle();
  assert.equal(
    await frame.evaluate(
      () => Reflect.get(window, "__presentationIdentity") === document.getElementById("scene-2"),
    ),
    true,
    "presentation copy retains mounted preview",
  );
  assert.equal(
    await readFile(join(directory, selectedPath), "utf8"),
    selectedBefore,
    "presentation copy preserves selected source bytes",
  );
  assert.equal(
    await readFile(join(directory, "index.html"), "utf8"),
    parentBefore,
    "presentation copy preserves cut clocks and global overlays",
  );
  const beforeMedia = parseHTML(siblingBefore).document.querySelector("video")!;
  const copiedMedia = parseHTML(
    await readFile(join(directory, "source-scene-1.html"), "utf8"),
  ).document.querySelector("video")!;
  for (const name of ["id", "src", "data-start", "data-duration", "data-media-start", "muted"])
    assert.equal(
      copiedMedia.getAttribute(name),
      beforeMedia.getAttribute(name),
      `presentation preserves ${name}`,
    );
  const copied = await geometry(page);
  assert.deepEqual(copied[0], copied[1], "both cuts show copied saved static geometry");
  const reopenUrl = new URL(page.url());
  reopenUrl.searchParams.delete("view");
  await page.goto(reopenUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-el-id="index.html#scene-2"]', { timeout: 60000 });
  await selectVideo(page, idle);
  const reopened = await geometry(page);
  for (let index = 0; index < 2; index++)
    for (const key of ["x", "y", "width", "height"] as const)
      near(reopened[index][key], copied[index][key], `reopened presentation ${index} ${key}`);
  await page.locator('button[aria-label="Undo"]').click();
  await idle();
  assert.equal(
    await readFile(join(directory, "source-scene-1.html"), "utf8"),
    siblingBefore,
    "one Undo restores Apply-all presentation",
  );
  assert.equal(await readFile(join(directory, selectedPath), "utf8"), selectedBefore);
  console.log(
    "CUT PRESENTATION PASS: saved static layout copied, preview retained, source clocks/assets unchanged, reopen and single Undo",
  );
}

export async function verifySplitCutGestures(
  page: Page,
  directory: string,
  idle: () => Promise<void>,
  outputs: string,
) {
  const original = await readFile(join(directory, "source-scene-1.html"), "utf8");
  await selectVideo(page, idle);
  const before = await geometry(page);
  const scripts = await (
    await preview(page)
  ).evaluate(() => ({
    hosts: [...document.querySelectorAll("[data-composition-id]")].map((el) => ({
      id: el.id,
      compositionId: el.getAttribute("data-composition-id"),
      file: el.getAttribute("data-composition-file"),
    })),
    scripts: [...document.querySelectorAll("script:not([src])")]
      .filter((script) => (script.textContent?.length ?? 0) < 30000)
      .map((script) => ({
        id: script.id,
        source: script.getAttribute("data-composition-id"),
        text: script.textContent,
      })),
  }));
  const mutations: unknown[] = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/gsap-mutations")) return;
    try {
      mutations.push({ url: response.url(), result: await response.json() });
    } catch {}
  });
  await (
    await preview(page)
  ).evaluate(() => Reflect.set(window, "__cutGestureIdentity", document.getElementById("scene-2")));
  const dragSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/gsap-mutations") && response.request().method() === "POST",
    { timeout: 30000 },
  );
  let box = (await (await page.$('[data-dom-edit-selection-box="true"]'))!.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 18, box.y + box.height / 2 + 24, { steps: 8 });
  await page.mouse.up();
  const dragResponse = await dragSaved;
  mutations.push({ url: dragResponse.url(), result: await dragResponse.json() });
  await idle();
  await writeFile(
    join(outputs, "gesture-debug.json"),
    JSON.stringify({ scripts, mutations }, null, 2),
  );
  const dragged = await geometry(page);
  assert.ok(
    dragged[1].x > before[1].x + 10 && dragged[1].y > before[1].y + 10,
    "selected video moves",
  );
  const parent = parseHTML(await readFile(join(directory, "index.html"), "utf8")).document;
  const path = parent.getElementById("scene-2")!.getAttribute("data-composition-src")!;
  assert.notEqual(path, "source-scene-1.html", "gesture must isolate shared child source");
  assert.equal(
    await readFile(join(directory, "source-scene-1.html"), "utf8"),
    original,
    "gesture leaves sibling file untouched",
  );
  assert.deepEqual(dragged[0], before[0], "gesture leaves sibling geometry untouched");
  const retained = await (
    await preview(page)
  ).evaluate(
    () => Reflect.get(window, "__cutGestureIdentity") === document.getElementById("scene-2"),
  );
  console.log("CUT DRAG isolated and sibling unchanged; retained preview:", retained);
  assert.equal(retained, true, "drag preserves the preview and selected source host");
  await writeFile(
    join(outputs, "gesture-debug.json"),
    JSON.stringify({ scripts, mutations, retained }, null, 2),
  );

  await selectVideo(page, idle);
  box = (await (await page.$('[data-dom-edit-selection-box="true"]'))!.boundingBox())!;
  const resizeSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/gsap-mutations") && response.request().method() === "POST",
    { timeout: 30000 },
  );
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 30, { steps: 8 });
  await page.mouse.up();
  await resizeSaved;
  await idle();
  const resized = await geometry(page);
  assert.equal(
    await (
      await preview(page)
    ).evaluate(
      () => Reflect.get(window, "__cutGestureIdentity") === document.getElementById("scene-2"),
    ),
    true,
    "resize preserves the preview and selected source host",
  );
  assert.ok(resized[1].width < dragged[1].width - 10, "selected video resizes");
  assert.deepEqual(resized[0], before[0], "resize leaves sibling geometry untouched");
  assert.equal(
    await readFile(join(directory, "source-scene-1.html"), "utf8"),
    original,
    "resize leaves sibling file untouched",
  );
  const resizedParent = parseHTML(await readFile(join(directory, "index.html"), "utf8")).document;
  assert.equal(
    resizedParent.getElementById("scene-2")!.getAttribute("data-composition-src"),
    path,
    "second edit reuses isolated child",
  );
  console.log("CUT RESIZE persisted to same isolated child");

  await page.locator('button[aria-label="Undo"]').click();
  await idle();
  near((await geometry(page))[1].width, dragged[1].width, "one Undo restores resize");
  await page.locator('button[aria-label="Undo"]').click();
  await idle();
  const undone = parseHTML(await readFile(join(directory, "index.html"), "utf8")).document;
  assert.equal(
    undone.getElementById("scene-2")!.getAttribute("data-composition-src"),
    "source-scene-1.html",
    "undo restores shared source reference",
  );
  await page.locator('button[aria-label="Redo"]').click();
  await idle();
  await page.locator('button[aria-label="Redo"]').click();
  await idle();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-el-id="index.html#scene-2"]', { timeout: 60000 });
  await selectVideo(page, idle);
  const reopened = await geometry(page);
  for (const key of ["x", "y", "width", "height"] as const)
    near(reopened[1][key], resized[1][key], `reopened ${key}`);
  assert.deepEqual(reopened[0], before[0], "reopened sibling geometry unchanged");
  console.log("CUT GESTURES undo/redo/reopen passed; initial preview retained:", retained);
  await verifyPresentationCopy(page, directory, idle, path);
  // Restore shared sources for the independent Apply-all regression that follows.
  await page.locator('button[aria-label="Undo"]').click();
  await idle();
  await page.locator('button[aria-label="Undo"]').click();
  await idle();
  console.log(
    "CUT GESTURES PASS: shared child isolated, sibling untouched, resize and drag undo/redo/reopen",
  );
}
