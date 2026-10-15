import { afterAll, beforeAll, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { compileCanonicalComposition } from "./canonical-composition";
import { patchClipAdjustment, readClipAdjustments } from "../../studio/src/utils/clipAdjustments";

const originalDOMParser = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
beforeAll(() => {
  Object.defineProperty(globalThis, "DOMParser", {
    configurable: true,
    value: new Window().DOMParser,
  });
});
afterAll(() => {
  if (originalDOMParser) Object.defineProperty(globalThis, "DOMParser", originalDOMParser);
  else Reflect.deleteProperty(globalThis, "DOMParser");
});

it("keeps canonical cleaned camera speech editable by Studio's existing clip controls", () => {
  const composition = compileCanonicalComposition(
    {
      schema_version: 1,
      title: "Camera",
      width: 320,
      height: 180,
      duration: 1,
      dynamic_range: "sdr",
      assets: [
        { id: "camera", kind: "video", name: "Camera", url: "/media/camera.mp4", duration: 4 },
        {
          id: "speech",
          kind: "audio",
          name: "Clean speech",
          url: "/media/speech.wav",
          duration: 4,
        },
      ],
      scenes: [{ id: "first", asset_id: "camera", start: 0, duration: 1, source_in: 2 }],
      audio: [
        {
          id: "audio-1",
          asset_id: "speech",
          start: 0,
          duration: 1,
          source_in: 2,
          scene_id: "first",
        },
      ],
    },
    new Map([
      ["camera", "assets/camera.mp4"],
      ["speech", "assets/speech.wav"],
    ]),
  );
  const source = composition.files.get("source-scene-1.html")!;
  expect(readClipAdjustments(source).hasAudio).toBe(true);
  const quieter = patchClipAdjustment(source, "volume", 35);
  expect(readClipAdjustments(quieter).volume).toBe(35);
  const muted = patchClipAdjustment(quieter, "muted", true);
  expect(readClipAdjustments(muted).muted).toBe(true);
  const document = new DOMParser().parseFromString(muted, "text/html");
  expect(document.querySelector("audio")?.hasAttribute("data-hidden")).toBe(true);
  expect(document.querySelector("video")?.getAttribute("data-has-audio")).toBe("false");
});
