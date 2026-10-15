import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import {
  compileCanonicalComposition,
  parseCanonicalComposition,
  type CanonicalCompositionPlan,
} from "./canonical-composition";

export function canonicalFixture(): CanonicalCompositionPlan {
  return {
    schema_version: 1,
    title: "Editable <Story>",
    width: 320,
    height: 180,
    duration: 4,
    dynamic_range: "sdr",
    assets: [
      {
        id: "camera",
        name: "Original camera",
        kind: "video",
        url: "/media/camera.mp4",
        preview_url: "/media/proxy.mp4",
        duration: 8,
        width: 640,
        height: 360,
      },
      { id: "voice", name: "Clean speech", kind: "audio", url: "/media/voice.wav", duration: 8 },
      { id: "music", name: "Music", kind: "audio", url: "/media/music.wav", duration: 8 },
      { id: "logo", name: "Logo", kind: "image", url: "/media/logo.png" },
      { id: "font", name: "Brand font", kind: "font", url: "/media/font.ttf" },
    ],
    scenes: [
      {
        id: "first",
        asset_id: "camera",
        start: 0,
        duration: 2,
        source_in: 1,
        crop: { x: 160, y: 90, width: 320, height: 180 },
        fade_out: 0.08,
      },
      {
        id: "second",
        asset_id: "camera",
        start: 2,
        duration: 2,
        source_in: 4,
        fade_in: 0.08,
        crop_keyframes: [
          { time: 0, x: 0, y: 90, width: 320, height: 180 },
          { time: 1, x: 320, y: 90, width: 320, height: 180 },
        ],
      },
    ],
    audio: [
      { id: "speech", asset_id: "voice", start: 0, duration: 2, source_in: 1, scene_id: "first" },
      { id: "narration", asset_id: "voice", start: 2, duration: 2, source_in: 3 },
      {
        id: "bed",
        asset_id: "music",
        start: 0,
        duration: 4,
        source_in: 0,
        volume: 0.2,
        envelope: [
          { time: 0, value: 0 },
          { time: 0.5, value: 0.2 },
          { time: 1, value: 0.08 },
          { time: 3, value: 0.2 },
          { time: 4, value: 0 },
        ],
      },
    ],
    captions: {
      groups: [
        [{ text: "Camera <speech>", start: 0.2, end: 1.4 }],
        [{ text: "Narration", start: 2.2, end: 3.4 }],
      ],
      style: {
        preset: "karaoke",
        weight: 700,
        size: 0.05,
        word_spacing: 0.1,
        letter_spacing: 0.02,
        position: { x: 0.5, y: 0.84 },
      },
      font_asset_id: "font",
    },
    overlays: [
      {
        id: "brand",
        asset_id: "logo",
        start: 0,
        duration: 4,
        x: 8,
        y: 8,
        width: 32,
        height: 32,
        opacity: 0.7,
      },
      {
        id: "credit",
        text: "Music & artist",
        start: 3,
        duration: 1,
        x: 10,
        y: 150,
        width: 300,
        height: 25,
        font_size: 16,
      },
    ],
  };
}

test("preserves explicit legacy subtitle pixel sizes without widening modern style validation", () => {
  const input = canonicalFixture();
  input.captions!.font_size_px = 123;
  const paths = new Map(input.assets.map((asset) => [asset.id, `assets/${asset.id}.mp4`]));
  const result = compileCanonicalComposition(input, paths);
  expect(result.files.get("source-scene-1.html")).toContain("font-size:123px");
  expect(() =>
    parseCanonicalComposition({
      ...input,
      captions: { ...input.captions, font_size_px: "24px;color:red" },
    }),
  ).toThrow("caption font size");
  expect(() =>
    parseCanonicalComposition({ ...input, captions: { ...input.captions, font_size_px: 0 } }),
  ).toThrow("caption font size");
});
const paths = () =>
  new Map(
    canonicalFixture().assets.map((asset) => [
      asset.id,
      {
        path: `assets/${asset.id}.${asset.kind === "video" ? "mp4" : asset.kind === "audio" ? "wav" : asset.kind === "font" ? "ttf" : "png"}`,
        ...(asset.preview_url ? { previewPath: "assets/proxy.mp4" } : {}),
      },
    ]),
  );

describe("canonical editable compositions", () => {
  test("nests prepared transition pictures below the parent captions without replacing camera audio", () => {
    const plan = canonicalFixture();
    plan.scenes.push({
      id: "bridge-left",
      role: "bridge",
      parent_scene_id: "first",
      asset_id: "camera",
      start: 1.9,
      duration: 0.1,
      source_in: 0,
    });
    const output = compileCanonicalComposition(plan, paths());
    const scene = output.files.get("source-scene-1.html")!;
    expect(scene).toContain('id="bridge-bridge-left"');
    expect(scene).toContain('data-start="2.9" data-duration="0.1"');
    expect(scene).toContain('style="z-index:1;object-fit:contain"');
    expect(scene).toContain("z-index:2000");
    expect(scene).toContain('id="audio-speech-audio"');
    expect(output.html).not.toContain('id="scene-bridge-left"');
    plan.scenes.at(-1)!.parent_scene_id = "missing";
    expect(() => parseCanonicalComposition(plan)).toThrow("bridge");
  });
  test("keeps originals, linked clean speech and captions while independent narration/music preserve their clock", () => {
    const output = compileCanonicalComposition(canonicalFixture(), paths());
    const scene = output.files.get("source-scene-1.html")!;
    expect(scene).toContain('src="assets/camera.mp4" data-preview-src="assets/proxy.mp4"');
    expect(scene).toContain('data-duration="8" data-track-index="1"');
    expect(scene).toContain('data-media-start="0" data-source-duration="8"');
    expect(scene).toContain('data-start="1.2"');
    expect(scene).toContain("Camera &lt;speech&gt;");
    expect(scene).toContain('src:url("assets/font.ttf")');
    expect(scene).toContain("word-spacing:0.1em");
    expect(output.html).not.toContain("Camera &lt;speech&gt;");
    expect(output.html).toContain("Narration");
    expect(output.html).toContain('id="audio-narration"');
    const { document } = parseHTML(output.html);
    const envelope = JSON.parse(
      document.querySelector("#audio-bed")!.getAttribute("data-automation")!,
    );
    expect(envelope.lanes[0].points).toEqual([
      { t: 0, v: 0 },
      { t: 0.5, v: 0.2 },
      { t: 1, v: 0.08 },
      { t: 3, v: 0.2 },
      { t: 4, v: 0 },
    ]);
    expect(output.html).toContain('src="assets/logo.png"');
    expect(output.html).toContain("Music &amp; artist");
  });
  test("persists crop coordinates and source-clock keyframes, fades and delivery intent", () => {
    const plan = canonicalFixture();
    plan.dynamic_range = "hdr";
    const output = compileCanonicalComposition(plan, paths());
    expect(output.files.get("source-scene-1.html")).toContain("left:-50%;top:-50%");
    expect(output.files.get("source-scene-2.html")).toContain('"left":"-100%"');
    expect(output.files.get("source-scene-2.html")).toContain("},5);");
    expect(output.html).toContain('duration:0.08,ease:"none"');
    expect(output.renderOptions.hdrMode).toBe("force-hdr");
    expect(JSON.parse(output.files.get("render-config.json")!).hdrMode).toBe("force-hdr");
  });
  test("rejects invalid plans before any media IO", () => {
    const mutate = (change: (plan: CanonicalCompositionPlan) => void) => {
      const plan = canonicalFixture();
      change(plan);
      expect(() => parseCanonicalComposition(plan)).toThrow();
    };
    mutate((plan) => {
      plan.width = 321;
    });
    mutate((plan) => {
      plan.scenes[0]!.asset_id = "missing";
    });
    mutate((plan) => {
      plan.scenes[0]!.source_in = 7;
    });
    mutate((plan) => {
      plan.scenes[0]!.crop!.x = 500;
    });
    mutate((plan) => {
      plan.audio[0]!.scene_id = "missing";
    });
    mutate((plan) => {
      plan.audio[0]!.envelope = [
        { time: 1, value: 1 },
        { time: 0, value: 0 },
      ];
    });
    mutate((plan) => {
      plan.captions!.style.text_color = 'red;content:"injected"';
    });
    mutate((plan) => {
      plan.captions!.style.size = "</style><script>bad()</script>";
    });
    mutate((plan) => {
      plan.overlays![0]!.background = "url(https://bad.test)";
    });
    mutate((plan) => {
      plan.audio[0]!.id = plan.scenes[0]!.id;
    });
    const unsafePaths = paths();
    unsafePaths.set("camera", { path: "assets/../private.mp4" });
    expect(() => compileCanonicalComposition(canonicalFixture(), unsafePaths)).toThrow();
  });
});
