// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { patchClipAdjustment, readClipAdjustments } from "./clipAdjustments";
import { buildSourceCutChanges, sourceCutTargets } from "./sourceCutChanges";
import { saveProjectFilesWithHistory, type RecordEditInput } from "./studioFileHistory";

const scene = (number: number, processed = false) => `<!doctype html><html><body>
  <div id="source-scene-${number}" data-composition-id="source-scene-${number}">
    <video id="source-scene-${number}-video" class="clip source-video" data-start="0" data-duration="8" data-media-start="0" data-has-audio="${!processed}" src="assets/source.mp4" style="object-fit:cover"></video>
    ${processed ? `<audio id="source-scene-${number}-audio" data-start="0" data-duration="8" src="assets/speech.wav"></audio>` : ""}
    <audio data-cut-sfx="click" data-volume="0.7" src="assets/click.wav"></audio>
    <p id="source-scene-${number}-caption" style="color:white">Keep this caption</p>
  </div><script>window.__timelines["source-scene-${number}"]=timeline;</script></body></html>`;
const host = (id: number, source = id) =>
  `<div id="scene-${id}" data-source-window data-composition-id="source-scene-${source}" data-composition-src="source-scene-${source}.html" data-playback-start="${id}" data-duration="2"></div>`;
const parent = `<div data-composition-id="main">${host(1)}${host(2)}</div>`;
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("source clip image and sound adjustments", () => {
  it("reads the canonical end time after native trimming", () => {
    expect(
      sourceCutTargets(
        '<div id="scene-1" data-source-window data-composition-src="source-scene-1.html" data-start="4" data-end="5.5" data-playback-start="2"></div>',
      ),
    ).toEqual([{ id: "scene-1", path: "source-scene-1.html", sourceStart: 2, duration: 1.5 }]);
  });
  it("changes the video's image only and keeps authored filters, source timing, captions and sound", () => {
    const before = scene(1).replace("object-fit:cover", "object-fit:cover;filter:blur(0.2px)");
    const after = patchClipAdjustment(before, "brightness", 130);
    const document = parse(after);
    expect(document.querySelector("video")!.style.filter).toBe(
      "blur(0.2px) brightness(130%) contrast(100%) saturate(100%)",
    );
    expect(document.querySelector("video")!.getAttribute("data-media-start")).toBe("0");
    expect(document.querySelector("p")!.outerHTML).toBe(
      parse(before).querySelector("p")!.outerHTML,
    );
    expect(document.querySelector("audio")!.outerHTML).toBe(
      parse(before).querySelector("audio")!.outerHTML,
    );
  });

  it("authors a normalized real sharpening kernel, keeps one definition, and removes its application at zero", () => {
    const sharp = patchClipAdjustment(patchClipAdjustment(scene(1), "sharpen", 40), "sharpen", 70);
    const document = parse(sharp);
    expect(document.querySelectorAll("filter")).toHaveLength(1);
    expect(document.querySelector("feConvolveMatrix")!.getAttribute("kernelMatrix")).toBe(
      "0 -0.7 0 -0.7 3.8 -0.7 0 -0.7 0",
    );
    expect(document.querySelector("video")!.style.filter).toContain(
      'url("#source-scene-1-video-cut-sharpen")',
    );
    expect(
      parse(patchClipAdjustment(sharp, "sharpen", 0)).querySelector("video")!.style.filter,
    ).not.toContain("url(");
  });

  it("mutes native camera audio without hiding video, and restores its volume and export eligibility", () => {
    const quieter = patchClipAdjustment(scene(1), "volume", 35);
    const muted = patchClipAdjustment(quieter, "muted", true);
    const video = parse(muted).querySelector("video")!;
    expect(video.hasAttribute("muted")).toBe(true);
    expect(video.getAttribute("data-has-audio")).toBe("false");
    expect(video.hasAttribute("data-hidden")).toBe(false);
    expect(readClipAdjustments(muted)).toMatchObject({ volume: 35, muted: true, hasAudio: true });
    const restored = parse(patchClipAdjustment(muted, "muted", false)).querySelector("video")!;
    expect(restored.hasAttribute("muted")).toBe(false);
    expect(restored.getAttribute("data-has-audio")).toBe("true");
    expect(restored.getAttribute("data-volume")).toBe("0.35");
  });

  it("adjusts processed speech while leaving SFX and the silent camera untouched", () => {
    const changed = patchClipAdjustment(
      patchClipAdjustment(scene(1, true), "volume", 50),
      "muted",
      true,
    );
    const document = parse(changed);
    expect(document.getElementById("source-scene-1-audio")!.getAttribute("data-volume")).toBe(
      "0.5",
    );
    expect(document.getElementById("source-scene-1-audio")!.hasAttribute("data-hidden")).toBe(true);
    expect(document.querySelector("video")!.hasAttribute("data-volume")).toBe(false);
    expect(document.querySelector("[data-cut-sfx]")!.getAttribute("data-volume")).toBe("0.7");
  });

  it("saves selected by default; explicit all changes only the requested property", () => {
    const sources = {
      "source-scene-1.html": scene(1),
      "source-scene-2.html": patchClipAdjustment(scene(2), "contrast", 175),
    };
    const args = {
      parentPath: "index.html",
      parentHtml: parent,
      selectedId: "scene-1",
      sources,
      existingPaths: Object.keys(sources),
      patch: (html: string) => patchClipAdjustment(html, "saturation", 50),
    };
    const selected = buildSourceCutChanges(args);
    expect(Object.keys(selected.files)).toEqual(["source-scene-1.html"]);
    const all = buildSourceCutChanges({ ...args, applyToAll: true });
    expect(Object.keys(all.files)).toHaveLength(2);
    expect(readClipAdjustments(all.files["source-scene-2.html"].after)).toMatchObject({
      saturation: 50,
      contrast: 175,
      volume: 100,
    });
    expect(all.files["index.html"]).toBeUndefined();
  });

  it("isolates a split cut, persists it with undo/redo, and namespaces its filters and captions", async () => {
    const beforeParent = `<div data-composition-id="main">${host(1)}${host(2, 1)}</div>`;
    const original = patchClipAdjustment(scene(1), "sharpen", 30);
    const sources = { "source-scene-1.html": original };
    const result = buildSourceCutChanges({
      parentPath: "index.html",
      parentHtml: beforeParent,
      selectedId: "scene-2",
      sources,
      existingPaths: ["source-scene-2.html"],
      patch: (html) => patchClipAdjustment(html, "brightness", 145),
    });
    expect(result.files["source-scene-1.html"]).toBeUndefined();
    expect(result.files["source-scene-3.html"].after).toContain(
      'window.__timelines["source-scene-3"]',
    );
    expect(result.files["source-scene-3.html"].after).toContain(
      "#source-scene-3-video-cut-sharpen",
    );
    const saved: Record<string, string> = {
      ...sources,
      "index.html": beforeParent,
      ...result.copies,
    };
    let history: RecordEditInput | null = null;
    await saveProjectFilesWithHistory({
      projectId: "fixture",
      label: "Clip brightness",
      kind: "source",
      files: Object.fromEntries(
        Object.entries(result.files).map(([path, edit]) => [path, edit.after]),
      ),
      readFile: async (path) => saved[path],
      writeFile: async (path, content, expected) => {
        expect(saved[path]).toBe(expected);
        saved[path] = content;
      },
      recordEdit: async (entry) => {
        history = entry;
      },
    });
    expect(
      parse(saved["index.html"]).getElementById("scene-2")!.getAttribute("data-composition-src"),
    ).toBe("source-scene-3.html");
    expect(readClipAdjustments(saved["source-scene-1.html"]).brightness).toBe(100);
    expect(readClipAdjustments(saved["source-scene-3.html"]).brightness).toBe(145);
    for (const [path, edit] of Object.entries(history!.files)) saved[path] = edit.before;
    expect(saved["index.html"]).toBe(beforeParent);
    for (const [path, edit] of Object.entries(history!.files)) saved[path] = edit.after;
    expect(readClipAdjustments(saved["source-scene-3.html"]).brightness).toBe(145);
    expect(saved["source-scene-1.html"]).toBe(original);
  });
});
