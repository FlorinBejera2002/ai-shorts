import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { parseHTML } from "linkedom";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitElementInHtml } from "@hyperframes/studio-server/source-mutation";
import {
  compileCanonicalComposition,
  type CanonicalCompositionPlan,
  type CanonicalAssetPath,
} from "./canonical-composition";
import {
  CanonicalMergeConflict,
  mergeCanonicalFiles,
  mergeCompositionProject,
  readEffectiveComposition,
} from "./canonical-merge";
import { patchClipAdjustment, readClipAdjustments } from "../../studio/src/utils/clipAdjustments";
import { patchCutSoundEffect } from "../../studio/src/utils/cutSoundEffects";
import { changeCompositionAspect } from "../../studio/src/utils/compositionAspectRatio";
import { buildSourceCutChanges } from "../../studio/src/utils/sourceCutChanges";

const originalDOMParser = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
beforeAll(() =>
  Object.defineProperty(globalThis, "DOMParser", {
    configurable: true,
    value: new Window().DOMParser,
  }),
);
afterAll(() => {
  if (originalDOMParser) Object.defineProperty(globalThis, "DOMParser", originalDOMParser);
  else Reflect.deleteProperty(globalThis, "DOMParser");
});

function plan(): CanonicalCompositionPlan {
  return {
    schema_version: 1,
    title: "Merge fixture",
    width: 320,
    height: 180,
    duration: 4,
    dynamic_range: "hdr",
    assets: [
      {
        id: "camera",
        kind: "video",
        name: "Camera",
        url: "/media/camera.mp4",
        duration: 12,
        width: 640,
        height: 360,
      },
      { id: "speech", kind: "audio", name: "Speech", url: "/media/speech.wav", duration: 12 },
      { id: "music", kind: "audio", name: "Music", url: "/media/music.wav", duration: 12 },
    ],
    scenes: [
      {
        id: "block-a",
        asset_id: "camera",
        start: 0,
        duration: 2,
        source_in: 1,
        crop: { x: 0, y: 0, width: 320, height: 180 },
      },
      { id: "block-b", asset_id: "camera", start: 2, duration: 2, source_in: 7 },
    ],
    audio: [
      {
        id: "speech-a",
        asset_id: "speech",
        start: 0,
        duration: 2,
        source_in: 1,
        scene_id: "block-a",
      },
      {
        id: "speech-b",
        asset_id: "speech",
        start: 2,
        duration: 2,
        source_in: 7,
        scene_id: "block-b",
      },
      { id: "bed", asset_id: "music", start: 0, duration: 4, source_in: 0, volume: 0.2 },
    ],
    captions: {
      groups: [
        [
          { text: "Camera", start: 0.2, end: 0.8 },
          { text: "words", start: 0.8, end: 1.5 },
        ],
      ],
      style: { preset: "karaoke", text_color: "#ffffff", size: 0.05 },
    },
    overlays: [
      {
        id: "title",
        text: "Old automatic title",
        start: 0,
        duration: 4,
        x: 10,
        y: 10,
        width: 200,
        height: 40,
        color: "#ffffff",
      },
      {
        id: "platform-badge",
        text: "Sneep",
        start: 0,
        duration: 4,
        x: 10,
        y: 80,
        width: 80,
        height: 30,
      },
    ],
  };
}

function compile(value = plan()) {
  return compileCanonicalComposition(
    value,
    new Map<string, CanonicalAssetPath>([
      ["camera", { path: "assets/camera.mp4", previewPath: "assets/preview.mp4" }],
      ["speech", "assets/speech.wav"],
      ["music", "assets/music.wav"],
    ]),
  ).files;
}
const document = (files: ReadonlyMap<string, string>, path = "index.html") =>
  parseHTML(files.get(path)!).document;
function edit(files: Map<string, string>, path: string, operation: (doc: Document) => void) {
  const doc = document(files, path);
  operation(doc);
  files.set(path, doc.toString());
}

describe("canonical three-way regeneration", () => {
  test("reports effective source windows with canonical duration precedence and legacy end fallback", () => {
    const files = compile();
    edit(files, "index.html", (doc) => {
      doc.getElementById("main")!.setAttribute("data-end", "3");
      doc.getElementById("scene-block-a")!.setAttribute("data-end", "1");
    });
    const effective = readEffectiveComposition(files);
    expect(effective.duration).toBe(4);
    expect(effective.scenes.map((scene) => scene.duration)).toEqual([2, 2]);
    edit(files, "index.html", (doc) => {
      doc.getElementById("main")!.removeAttribute("data-duration");
      doc.getElementById("scene-block-a")!.removeAttribute("data-duration");
    });
    const legacy = readEffectiveComposition(files);
    expect(legacy.duration).toBe(3);
    expect(legacy.scenes.map((scene) => scene.duration)).toEqual([1, 1]);
  });

  test("reapplies a moved phrase as timing deltas when a preset creates separate word cues", () => {
    const base = compile(),
      current = new Map(base);
    edit(current, "source-scene-1.html", (doc) => {
      doc.querySelector(".story-caption")!.setAttribute("data-start", "1.3");
    });
    const next = plan();
    next.captions!.style.preset = "word-by-word";
    const merged = mergeCanonicalFiles(base, current, compile(next));
    const cues = [
      ...document(merged.files, "source-scene-1.html").querySelectorAll(".story-caption"),
    ];
    expect(Number(cues[0]!.getAttribute("data-start"))).toBeCloseTo(1.3);
    expect(Number(cues[1]!.getAttribute("data-start"))).toBeCloseTo(1.9);
  });

  test("takes automatic changes when no authored field changed", () => {
    const base = compile();
    const next = plan();
    next.overlays![0]!.text = "New automatic title";
    next.scenes[0]!.crop!.x = 100;
    const merged = mergeCanonicalFiles(base, base, compile(next));
    expect(document(merged.files).getElementById("overlay-title")?.textContent).toBe(
      "New automatic title",
    );
    expect(
      document(merged.files, "source-scene-1.html").querySelector("video")?.getAttribute("style"),
    ).toContain("left:-31.25%");
    expect(JSON.parse(merged.files.get("render-config.json")!)).toEqual({ hdrMode: "force-hdr" });
  });

  test("keeps real Studio volume, image, SFX, rich text, spacing, motion, assets and legacy manifest edits", () => {
    const base = compile(),
      current = new Map(base);
    let child = patchClipAdjustment(current.get("source-scene-1.html")!, "volume", 35);
    child = patchClipAdjustment(child, "brightness", 120);
    child = patchCutSoundEffect(child, {
      effect: "pop",
      volume: 0.4,
      assetPath: "assets/manual-pop.wav",
    });
    current.set("source-scene-1.html", child);
    current.set("assets/manual-pop.wav", "fixture bytes");
    current.set(
      ".hyperframes/studio-manual-edits.json",
      JSON.stringify({
        version: 1,
        edits: [
          {
            kind: "rotation",
            target: { sourceFile: "index.html", id: "overlay-title" },
            angle: 20,
          },
        ],
      }),
    );
    edit(current, "source-scene-1.html", (doc) => {
      const word = doc.querySelector(".story-caption-text span")!;
      word.textContent = "Corrected";
      word.setAttribute("style", "font-family:Georgia;letter-spacing:2px;color:#ff0000");
    });
    edit(current, "index.html", (doc) => {
      const title = doc.getElementById("overlay-title")!;
      title.setAttribute(
        "data-hf-studio-motion",
        '{"start":0,"duration":1,"from":{"opacity":0},"to":{"opacity":1}}',
      );
      const layer = doc.createElement("div");
      layer.id = "manual-title";
      layer.textContent = "Keep my layer";
      doc.getElementById("main")!.append(layer);
    });
    const next = plan();
    next.scenes[0]!.crop!.x = 100;
    next.overlays![0]!.text = "Updated generator title";
    next.audio[0]!.volume = 0.9;
    next.captions!.style.size = 0.08;
    const merged = mergeCanonicalFiles(base, current, compile(next));
    const source = merged.files.get("source-scene-1.html")!;
    expect(readClipAdjustments(source)).toMatchObject({ volume: 35, brightness: 120 });
    const doc = document(merged.files, "source-scene-1.html");
    expect(doc.querySelector("audio[data-cut-sfx]")?.getAttribute("data-volume")).toBe("0.4");
    expect(doc.querySelector(".story-caption-text span")?.textContent).toBe("Corrected");
    expect(doc.querySelector(".story-caption-text span")?.getAttribute("style")).toContain(
      "letter-spacing:2px",
    );
    expect(doc.querySelector("video")?.getAttribute("style")).toContain("left:-31.25%");
    expect(document(merged.files).getElementById("overlay-title")?.textContent).toBe(
      "Updated generator title",
    );
    expect(
      document(merged.files).getElementById("overlay-title")?.hasAttribute("data-hf-studio-motion"),
    ).toBe(true);
    expect(document(merged.files).getElementById("manual-title")?.textContent).toBe(
      "Keep my layer",
    );
    expect(merged.files.get("assets/manual-pop.wav")).toBe("fixture bytes");
    expect(merged.files.get(".hyperframes/studio-manual-edits.json")).toBe(
      current.get(".hyperframes/studio-manual-edits.json"),
    );
  });

  test("retains split timing and copy-on-write child edits while updating caption styles", () => {
    const base = compile(),
      current = new Map(base);
    const split = splitElementInHtml(
      base.get("index.html")!,
      { id: "scene-block-a" },
      1,
      "scene-block-a-split",
    );
    current.set("index.html", split.html);
    const changes = buildSourceCutChanges({
      parentPath: "index.html",
      parentHtml: split.html,
      selectedId: "scene-block-a-split",
      sources: Object.fromEntries(current),
      existingPaths: [...current.keys()],
      patch: (source) => patchClipAdjustment(source, "volume", 22),
    });
    for (const [path, source] of Object.entries(changes.copies)) current.set(path, source);
    for (const [path, change] of Object.entries(changes.files)) current.set(path, change.after);
    const next = plan();
    next.scenes[0]!.duration = 1.5;
    next.scenes[1]!.start = 1.5;
    next.scenes[1]!.duration = 2.5;
    next.audio[0]!.duration = 1.5;
    next.audio[1]!.start = 1.5;
    next.audio[1]!.duration = 2.5;
    next.captions!.style.size = 0.08;
    const merged = mergeCanonicalFiles(base, current, compile(next));
    const hosts = [...document(merged.files).querySelectorAll("[data-source-window]")];
    expect(
      hosts.map((host) => [
        host.id,
        host.getAttribute("data-duration"),
        host.getAttribute("data-playback-start"),
      ]),
    ).toEqual([
      ["scene-block-a", "1", "1"],
      ["scene-block-a-split", "1", "2"],
      ["scene-block-b", "2", "7"],
    ]);
    const path = hosts[1]!.getAttribute("data-composition-src")!;
    expect(readClipAdjustments(merged.files.get(path)!).volume).toBe(22);
    expect(merged.files.get(path)).toContain("font-size:14.4px");
    expect(readClipAdjustments(merged.files.get("source-scene-1.html")!).volume).toBe(100);
  });

  test("follows scene identity through reordering and repeated regeneration", () => {
    const base = compile(),
      current = new Map(base);
    current.set(
      "source-scene-1.html",
      patchClipAdjustment(current.get("source-scene-1.html")!, "volume", 31),
    );
    const next = plan();
    next.scenes = [
      { ...next.scenes[1]!, start: 0 },
      { ...next.scenes[0]!, start: 2 },
    ];
    next.audio[0]!.start = 2;
    next.audio[1]!.start = 0;
    const first = mergeCanonicalFiles(base, current, compile(next));
    expect(
      document(first.files)
        .querySelectorAll("[data-source-window]")[1]
        ?.getAttribute("data-composition-src"),
    ).toBe("source-scene-1.html");
    expect(readClipAdjustments(first.files.get("source-scene-1.html")!).volume).toBe(31);
    next.overlays![0]!.text = "Third title";
    const second = mergeCanonicalFiles(first.baseline, first.files, compile(next));
    expect(readClipAdjustments(second.files.get("source-scene-1.html")!).volume).toBe(31);
    expect(document(second.files).getElementById("overlay-title")?.textContent).toBe("Third title");
  });

  test("keeps the manually chosen aspect ratio and HDR output", () => {
    const base = compile(),
      current = new Map(base);
    for (const [path, html] of current)
      if (path.endsWith(".html")) current.set(path, changeCompositionAspect(html, "1:1"));
    const next = plan();
    next.width = 1920;
    next.height = 1080;
    const merged = mergeCanonicalFiles(base, current, compile(next));
    expect(readEffectiveComposition(merged.files)).toMatchObject({
      width: 1080,
      height: 1080,
      duration: 4,
    });
    expect(merged.files.get("render-config.json")).toContain("force-hdr");
  });

  test("updates a regenerated composition inside nested exact trim wrappers", () => {
    const base = compile(),
      current = new Map(base);
    current.set("original-composition-a.html", current.get("index.html")!);
    const wrapper = (path: string, start: number, duration: number) =>
      `<!doctype html><html><body><div id="main" data-composition-id="main" data-width="320" data-height="180" data-duration="${duration}"><div id="window" data-source-window data-composition-src="${path}" data-start="0" data-duration="${duration}" data-playback-start="${start}"></div></div></body></html>`;
    current.set("original-composition-b.html", wrapper("original-composition-a.html", 0.5, 3));
    current.set("index.html", wrapper("original-composition-b.html", 0.5, 2));
    current.set(
      "source-scene-1.html",
      patchClipAdjustment(current.get("source-scene-1.html")!, "volume", 44),
    );
    const next = plan();
    next.overlays![0]!.text = "Title after trims";
    const merged = mergeCanonicalFiles(base, current, compile(next));
    expect(merged.files.get("index.html")).toBe(current.get("index.html"));
    expect(
      document(merged.files, "original-composition-a.html").getElementById("overlay-title")
        ?.textContent,
    ).toBe("Title after trims");
    expect(readClipAdjustments(merged.files.get("source-scene-1.html")!).volume).toBe(44);
    expect(
      readEffectiveComposition(merged.files).scenes.map((scene) => [
        scene.asset_id,
        scene.start,
        scene.duration,
        scene.source_in,
      ]),
    ).toEqual([
      ["camera", 0, 1, 2],
      ["camera", 1, 1, 7],
    ]);
  });

  test("removes only the generated platform badge for a clean export", () => {
    const base = compile(),
      current = new Map(base);
    edit(current, "index.html", (doc) => {
      doc.getElementById("overlay-title")!.textContent = "My title";
      doc.getElementById("overlay-platform-badge")!.setAttribute("style", "left:32px");
    });
    const clean = plan();
    clean.overlays = clean.overlays!.filter((overlay) => overlay.id !== "platform-badge");
    const merged = mergeCanonicalFiles(base, current, compile(clean));
    expect(document(merged.files).getElementById("overlay-platform-badge")).toBeNull();
    expect(document(merged.files).getElementById("overlay-title")?.textContent).toBe("My title");
  });

  test("keeps corrected words and typography when a caption preset regroups them", () => {
    const base = compile(),
      current = new Map(base);
    edit(current, "source-scene-1.html", (doc) => {
      const word = doc.querySelectorAll("[data-canonical-word]")[1]!;
      word.textContent = "Corrected second word";
      word.setAttribute("style", "letter-spacing:3px;font-family:Georgia");
    });
    const next = plan();
    next.captions!.style.preset = "word-by-word";
    const merged = mergeCanonicalFiles(base, current, compile(next));
    const words = [
      ...document(merged.files, "source-scene-1.html").querySelectorAll("[data-canonical-word]"),
    ];
    expect(words.map((word) => word.textContent)).toEqual(["Camera", "Corrected second word"]);
    expect(words[1]!.getAttribute("style")).toContain("letter-spacing:3px");
    expect(
      document(merged.files, "source-scene-1.html").querySelectorAll(".story-caption").length,
    ).toBe(2);
  });

  test("maps positional legacy scene ids by source overlap, not slot number", () => {
    const original = plan();
    original.scenes[0]!.id = "scene-1";
    original.scenes[1]!.id = "scene-2";
    original.audio[0]!.scene_id = "scene-1";
    original.audio[1]!.scene_id = "scene-2";
    const base = compile(original),
      current = new Map(base);
    current.set(
      "source-scene-1.html",
      patchClipAdjustment(current.get("source-scene-1.html")!, "volume", 29),
    );
    const next = structuredClone(original);
    next.scenes[0]!.source_in = 7.1;
    next.scenes[1]!.source_in = 1.1;
    next.audio[0]!.source_in = 7.1;
    next.audio[1]!.source_in = 1.1;
    const merged = mergeCanonicalFiles(base, current, compile(next));
    expect(
      document(merged.files)
        .querySelectorAll("[data-source-window]")[1]
        ?.getAttribute("data-composition-src"),
    ).toBe("source-scene-1.html");
    expect(readClipAdjustments(merged.files.get("source-scene-1.html")!).volume).toBe(29);
    expect(readEffectiveComposition(merged.files).scenes[1]).toMatchObject({
      source_in: 1.1,
      canonical_scene_id: "scene-1",
    });
  });

  test("adds new generated layers while retaining manual text and meaningful mixed text", () => {
    const base = compile(),
      current = new Map(base);
    edit(base, "index.html", (doc) => {
      doc.getElementById("overlay-title")!.innerHTML = "Hello <b>world</b> after";
    });
    current.set("index.html", base.get("index.html")!);
    edit(current, "index.html", (doc) => {
      doc.getElementById("overlay-title")!.setAttribute("style", "color:#ff0000");
    });
    const next = plan();
    next.overlays!.push({
      id: "new-layer",
      text: "New generator layer",
      start: 0,
      duration: 4,
      x: 5,
      y: 5,
      width: 80,
      height: 40,
    });
    const generated = compile(next);
    edit(generated, "index.html", (doc) => {
      doc.getElementById("overlay-title")!.innerHTML = "Hello <b>world</b> after";
    });
    const merged = mergeCanonicalFiles(base, current, generated);
    expect(document(merged.files).getElementById("overlay-title")?.innerHTML).toBe(
      "Hello <b>world</b> after",
    );
    expect(document(merged.files).getElementById("overlay-new-layer")?.textContent).toBe(
      "New generator layer",
    );
  });

  test("refuses to discard manual edits when no corresponding source remains", () => {
    const base = compile(),
      current = new Map(base);
    current.set(
      "source-scene-1.html",
      patchClipAdjustment(current.get("source-scene-1.html")!, "volume", 40),
    );
    const next = plan();
    next.scenes = next.scenes.slice(1);
    next.audio = next.audio.filter((audio) => audio.scene_id !== "block-a");
    expect(() => mergeCanonicalFiles(base, current, compile(next))).toThrow(CanonicalMergeConflict);
    expect(readClipAdjustments(current.get("source-scene-1.html")!).volume).toBe(40);
  });

  test("preserves original binary assets referenced by manual layers when legacy asset slots reorder", async () => {
    const temporary = fileURLToPath(new URL("../../../../.cache/tmp/", import.meta.url));
    await mkdir(temporary, { recursive: true });
    const scratch = await mkdtemp(join(temporary, "canonical-merge-"));
    if (!scratch.startsWith(join(temporary, "canonical-merge-")))
      throw new Error("Unexpected fixture cleanup path");
    try {
      const directories = Object.fromEntries(
        ["baseDir", "currentDir", "generatedDir", "outputDir", "baselineOutputDir"].map((key) => [
          key,
          join(scratch, key),
        ]),
      );
      const write = async (directory: string, files: Map<string, string>) => {
        for (const [path, contents] of files) {
          await mkdir(dirname(join(directory, path)), { recursive: true });
          await writeFile(join(directory, path), contents);
        }
      };
      const initial = plan();
      initial.assets.push({
        id: "second-camera",
        kind: "video",
        name: "Second camera",
        url: "/media/second.mp4",
        duration: 12,
      });
      initial.scenes[1]!.asset_id = "second-camera";
      const paths = new Map<string, CanonicalAssetPath>([
        ["camera", { path: "assets/camera.mp4", previewPath: "assets/preview.mp4" }],
        ["second-camera", { path: "assets/second.mp4", previewPath: "assets/second-preview.mp4" }],
        ["speech", "assets/speech.wav"],
        ["music", "assets/music.wav"],
      ]);
      const base = compileCanonicalComposition(initial, paths).files;
      const current = new Map(base);
      const reordered = structuredClone(initial);
      reordered.assets.reverse();
      reordered.scenes = [
        { ...reordered.scenes[1]!, start: 0 },
        { ...reordered.scenes[0]!, start: 2 },
      ];
      reordered.audio[0]!.start = 2;
      reordered.audio[1]!.start = 0;
      const swapped = new Map(paths);
      swapped.set("camera", paths.get("second-camera")!);
      swapped.set("second-camera", paths.get("camera")!);
      const next = compileCanonicalComposition(reordered, swapped).files;
      base.set("assets/camera.mp4", "ORIGINAL CAMERA A");
      base.set("assets/preview.mp4", "ORIGINAL PREVIEW A");
      base.set("assets/second.mp4", "ORIGINAL CAMERA B");
      base.set("assets/second-preview.mp4", "ORIGINAL PREVIEW B");
      current.set("assets/camera.mp4", "ORIGINAL CAMERA A");
      current.set("assets/preview.mp4", "ORIGINAL PREVIEW A");
      current.set("assets/second.mp4", "ORIGINAL CAMERA B");
      current.set("assets/second-preview.mp4", "ORIGINAL PREVIEW B");
      current.set("assets/custom.wav", "MY SOUND EFFECT");
      edit(current, "index.html", (doc) => {
        const layer = doc.createElement("video");
        layer.id = "manual-layer";
        layer.setAttribute("src", "assets/camera.mp4");
        doc.getElementById("main")!.append(layer);
      });
      next.set("assets/camera.mp4", "ORIGINAL CAMERA B");
      next.set("assets/preview.mp4", "ORIGINAL PREVIEW B");
      next.set("assets/second.mp4", "ORIGINAL CAMERA A");
      next.set("assets/second-preview.mp4", "ORIGINAL PREVIEW A");
      await write(directories.baseDir!, base);
      await write(directories.currentDir!, current);
      await write(directories.generatedDir!, next);
      const effective = await mergeCompositionProject({
        baseDir: directories.baseDir!,
        currentDir: directories.currentDir!,
        generatedDir: directories.generatedDir!,
        outputDir: directories.outputDir!,
        baselineOutputDir: directories.baselineOutputDir!,
      });
      const output = directories.outputDir!;
      const child = parseHTML(
        await readFile(join(output, "source-scene-1.html"), "utf8"),
      ).document.querySelector("video.source-video")!;
      expect(child.getAttribute("src")).not.toBe("assets/camera.mp4");
      expect(await readFile(join(output, child.getAttribute("src")!), "utf8")).toBe(
        "ORIGINAL CAMERA A",
      );
      expect(await readFile(join(output, child.getAttribute("data-preview-src")!), "utf8")).toBe(
        "ORIGINAL PREVIEW A",
      );
      expect(await readFile(join(output, "assets/camera.mp4"), "utf8")).toBe("ORIGINAL CAMERA A");
      expect(await readFile(join(output, "assets/custom.wav"), "utf8")).toBe("MY SOUND EFFECT");
      expect(
        parseHTML(await readFile(join(output, "index.html"), "utf8"))
          .document.getElementById("manual-layer")
          ?.getAttribute("src"),
      ).toBe("assets/camera.mp4");
      expect(effective.manually_edited).toBe(true);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
