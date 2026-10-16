// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  buildSourceCutChanges,
  prepareSourceCutChanges,
  sourceCutTargets,
} from "./sourceCutChanges";
import { boundedCutMediaSetting, patchCutMediaSettings } from "./sourceCutMediaSettings";
import { queueSourceCutTimingUpdate } from "./sourceCutTiming";
import { SOURCE_WINDOW_TIMING_UPDATE_ATTR } from "@hyperframes/core/media-timing";
import { isInsideAuthoredLockedComposition } from "./sourceCutLocks";
import { planSourceCutIsolation, applySourceCutIsolationToPreview } from "./sourceCutIsolation";
import { makeSelection } from "../hooks/domSelectionTestHarness";
import { syncSourceCutPreview } from "./sourceCutPreview";

const parent =
  '<main data-composition-id="main"><div id="first" data-source-window data-composition-src="source-scene-1.html" data-start="0" data-duration="2" data-playback-start="0"></div><div id="second" data-source-window data-composition-src="source-scene-1.html" data-start="2" data-duration="2" data-playback-start="3"></div><audio id="narration"></audio><img id="logo"></main>';
const source =
  '<html><head></head><body><div id="source-scene-1" data-composition-id="source-scene-1"><video id="source-scene-1-video" class="source-video" data-duration="8" data-source-duration="8" style="object-fit:cover"></video><audio id="source-scene-1-audio" data-duration="8"></audio><audio data-cut-sfx="click"></audio></div></body></html>';
const args = {
  parentPath: "index.html",
  parentHtml: parent,
  selectedId: "second",
  sources: { "source-scene-1.html": source },
  existingPaths: ["source-scene-1.html"],
};

describe("cut setting scope", () => {
  it("allocates past durable Undo copies when the project listing is stale", async () => {
    const read = vi.fn(async (path: string) => path === "source-scene-2.html");
    const changes = await prepareSourceCutChanges(
      {
        ...args,
        preserveNamespace: true,
        patch: (html, target) =>
          patchCutMediaSettings(html, target, "visual", [
            { type: "style", name: "object-fit", value: "contain" },
          ]),
      },
      read,
    );
    expect(read.mock.calls.map(([path]) => path)).toEqual([
      "source-scene-2.html",
      "source-scene-3.html",
    ]);
    expect(Object.keys(changes.copies)).toEqual(["source-scene-3.html"]);
    expect(changes.files["index.html"].after).toContain(
      'data-composition-src="source-scene-3.html"',
    );
    expect(changes.files["source-scene-2.html"]).toBeUndefined();
    expect(changes.copies["source-scene-3.html"]).toBe(source);
  });
  it("allows canvas changes inside source timing locks but preserves authored and ancestor locks", () => {
    const fixture = document.createElement("div");
    fixture.innerHTML =
      '<div data-source-window id="cut" data-composition-file="source-scene-1.html"><video data-timeline-locked data-hf-source-timing-lock></video></div>';
    const video = fixture.querySelector("video")!;
    expect(isInsideAuthoredLockedComposition(video)).toBe(false);
    fixture.setAttribute("data-timeline-locked", "");
    expect(isInsideAuthoredLockedComposition(video)).toBe(true);
    fixture.removeAttribute("data-timeline-locked");
    video.removeAttribute("data-hf-source-timing-lock");
    expect(isInsideAuthoredLockedComposition(video)).toBe(true);
  });
  it("includes the host rate when bounding source offset and child playback rate", () => {
    const target = sourceCutTargets(
      parent.replace('data-start="2"', 'data-playback-rate="2" data-start="2"'),
    )[1];
    const media = new DOMParser().parseFromString(source, "text/html").querySelector("video")!;
    expect(
      boundedCutMediaSetting(
        media,
        { type: "attribute", name: "data-media-start", value: "7" },
        target,
      ).value,
    ).toBe("1");
    expect(
      Number(
        boundedCutMediaSetting(
          media,
          { type: "attribute", name: "data-playback-rate", value: "3" },
          target,
        ).value,
      ),
    ).toBeCloseTo(8 / 7);
  });

  it("queues full authored values without replacing a source media node", () => {
    const host = document.createElement("div");
    host.setAttribute("data-source-window", "");
    const media = document.createElement("video");
    host.append(media);
    const authored = new DOMParser()
      .parseFromString(
        '<video data-start="0" data-duration="8" data-media-start="1" data-playback-rate="1.5"></video>',
        "text/html",
      )
      .querySelector("video")!;
    queueSourceCutTimingUpdate(media, authored);
    expect(JSON.parse(media.getAttribute(SOURCE_WINDOW_TIMING_UPDATE_ATTR)!)).toEqual({
      start: 0,
      duration: 8,
      mediaStart: 1,
      playbackRate: 1.5,
      hidden: false,
      automation: null,
    });
    expect(host.firstChild).toBe(media);
  });
  it("refuses ambiguous standalone edits to a source still shared by multiple cuts", async () => {
    const video = document.createElement("video");
    const selection = { ...makeSelection("video", video), sourceFile: "source-scene-1.html" };
    await expect(
      planSourceCutIsolation(
        selection,
        "source-scene-1.html",
        async () => parent,
        async () => false,
      ),
    ).rejects.toThrow("Select a cut in the main timeline");
  });

  it("clamps Apply all source offsets independently for split siblings", () => {
    const changes = buildSourceCutChanges({
      ...args,
      applyToAll: true,
      patch: (html, target) =>
        patchCutMediaSettings(html, target, "visual", [
          { type: "attribute", name: "data-media-start", value: "7" },
        ]),
    });
    const targets = sourceCutTargets(changes.files["index.html"].after);
    expect(targets[0].path).not.toBe(targets[1].path);
    expect(changes.files[targets[0].path].after).toContain('data-media-start="6"');
    expect(changes.files[targets[1].path].after).toContain('data-media-start="3"');
    expect(changes.files["source-scene-1.html"]).toBeUndefined();
    expect(changes.files["index.html"].after).toContain(
      '<audio id="narration"></audio><img id="logo">',
    );
  });

  it("copies audio FX onto camera sound without touching sound effects or visual media", () => {
    const target = sourceCutTargets(parent)[0];
    const after = patchCutMediaSettings(source, target, "audio", [
      { type: "attribute", name: "data-audio-fx", value: "rack" },
    ]);
    const doc = new DOMParser().parseFromString(after, "text/html");
    expect(doc.querySelector("audio[id]")?.getAttribute("data-audio-fx")).toBe("rack");
    expect(doc.querySelector("[data-cut-sfx]")?.hasAttribute("data-audio-fx")).toBe(false);
    expect(doc.querySelector("video")?.hasAttribute("data-audio-fx")).toBe(false);
  });

  it("applies a parent narration patch to the selected output time window", () => {
    const patchParent = vi.fn(
      (html: string, _targets: ReturnType<typeof sourceCutTargets>) =>
        html + "<!-- captions updated -->",
    );
    const changes = buildSourceCutChanges({ ...args, patch: (html) => html, patchParent });
    expect(patchParent.mock.calls[0][1]).toEqual([
      expect.objectContaining({ id: "second", start: 2, duration: 2 }),
    ]);
    expect(changes.files["index.html"].after).toContain("captions updated");
    expect(Object.keys(changes.files)).toEqual(["index.html"]);
  });

  it("forks an advanced edit from a compiled host without replacing any preview nodes", async () => {
    document.body.innerHTML =
      '<main data-composition-id="main" data-composition-file="index.html"><div id="second" data-source-window data-composition-file="source-scene-1.html"><video id="source-scene-1-video" class="source-video"></video></div></main>';
    const video = document.querySelector("video")!;
    const selection = { ...makeSelection(video.id, video), sourceFile: "source-scene-1.html" };
    const plan = await planSourceCutIsolation(
      selection,
      "index.html",
      async (path) => (path === "index.html" ? parent : source),
      async () => false,
    );
    expect(plan?.path).toBe("source-scene-2.html");
    expect(plan?.content).toBe(source);
    applySourceCutIsolationToPreview(plan!, selection);
    expect(document.querySelector("video")).toBe(video);
    expect(selection.sourceFile).toBe("source-scene-2.html");
    expect(sourceCutTargets(plan!.parentAfter).find((target) => target.id === "first")?.path).toBe(
      "source-scene-1.html",
    );
    document.body.innerHTML = "";
  });

  it("updates the selected split media in place and retains the sibling's setting", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = iframe.contentDocument!;
    doc.body.innerHTML =
      '<div id="first"><video data-hf-authored-id="source-scene-1-video" style="object-fit:cover;transform:translateX(12px)"></video></div><div id="second" data-composition-file="source-scene-1.html"><div data-composition-file="source-scene-1.html"><video data-hf-authored-id="source-scene-1-video" style="object-fit:cover;transform:translateX(12px)"></video></div></div>';
    const selected = doc.querySelector<HTMLElement>("#second video")!;
    const changes = buildSourceCutChanges({
      ...args,
      preserveNamespace: true,
      patch: (html, target) =>
        patchCutMediaSettings(html, target, "visual", [
          { type: "style", name: "object-fit", value: "contain" },
        ]),
    });
    expect(syncSourceCutPreview(iframe, "index.html", parent, changes)).toBe(true);
    expect(doc.querySelector("#second video")).toBe(selected);
    expect(selected.style.objectFit).toBe("contain");
    expect(selected.style.transform).toBe("translateX(12px)");
    expect(selected.parentElement?.getAttribute("data-composition-file")).toBe(
      "source-scene-2.html",
    );
    expect(doc.querySelector<HTMLElement>("#first video")!.style.objectFit).toBe("cover");
    iframe.remove();
  });
});
