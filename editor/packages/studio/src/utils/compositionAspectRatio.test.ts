// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  changeCompositionAspect,
  compositionCanvasDimensions,
  importedScenePaths,
} from "./compositionAspectRatio";

describe("canvas aspect ratio", () => {
  it("finds imported scenes and updates their host geometry with the parent canvas", () => {
    const source =
      '<div data-composition-id="main" data-width="1080" data-height="1920"><div data-composition-src="source-scene-1.html" data-width="1080" data-height="1920"></div><div data-composition-src="../private.html"></div></div>';
    expect(importedScenePaths(source)).toEqual(["source-scene-1.html"]);
    const document = new DOMParser().parseFromString(
      changeCompositionAspect(source, "4:5"),
      "text/html",
    );
    expect(
      document
        .querySelector('[data-composition-src="source-scene-1.html"]')
        ?.getAttribute("data-height"),
    ).toBe("1350");
  });
  it("updates authored and rendered dimensions without dropping timeline content", () => {
    const before =
      '<html><head><style>#main{width:1920px;height:1080px}</style></head><body><div id="main" data-composition-id="main" data-width="1920" data-height="1080" data-duration="12"><video id="scene" data-start="3" data-media-start="5" src="assets/source.mp4"></video></div><script>window.__timelines.main=timeline;</script></body></html>';
    const after = changeCompositionAspect(before, "9:16");
    const document = new DOMParser().parseFromString(after, "text/html");
    const root = document.getElementById("main")!;
    expect(root.getAttribute("data-width")).toBe("1080");
    expect(root.getAttribute("data-height")).toBe("1920");
    expect(root.style.width).toBe("1080px");
    expect(root.style.height).toBe("1920px");
    expect(root.getAttribute("data-duration")).toBe("12");
    expect(document.getElementById("scene")?.getAttribute("data-media-start")).toBe("5");
    expect(after).toContain("window.__timelines.main=timeline;");
  });
  it("rejects unsupported ratios and compositions without authored dimensions", () => {
    expect(() => changeCompositionAspect("<div></div>", "9:16")).toThrow("no editable canvas");
    expect(() => changeCompositionAspect("<div></div>", "0:0")).toThrow("supported aspect ratio");
  });
  it("restores a custom original canvas after multiple changes and a source reload", () => {
    const before =
      '<div data-composition-id="main" data-width="1440" data-height="1080" data-duration="8"><div data-composition-src="source-scene-1.html" data-width="1440" data-height="1080"></div><video data-media-start="2" data-duration="6"></video></div>';
    const portrait = changeCompositionAspect(before, "9:16");
    const square = changeCompositionAspect(portrait, "1:1");
    const restored = changeCompositionAspect(square, "Original");
    const document = new DOMParser().parseFromString(restored, "text/html");
    const root = document.querySelector<HTMLElement>("[data-composition-id]")!;
    expect([root.dataset.width, root.dataset.height]).toEqual(["1440", "1080"]);
    expect([root.style.width, root.style.height]).toEqual(["1440px", "1080px"]);
    expect(root.dataset.originalWidth).toBe("1440");
    expect(root.dataset.duration).toBe("8");
    expect(document.querySelector("video")?.getAttribute("data-media-start")).toBe("2");
    expect(document.querySelector("[data-composition-src]")?.getAttribute("data-width")).toBe(
      "1440",
    );
    // Restoring the prior saved file is Undo; Original still has the same target.
    expect(changeCompositionAspect(portrait, "Original")).toBe(restored);
  });
  it("rejects malformed saved original dimensions instead of changing geometry", () => {
    expect(() =>
      changeCompositionAspect(
        '<div data-composition-id="main" data-width="1080" data-height="1920" data-original-width="NaN"></div>',
        "Original",
      ),
    ).toThrow("invalid original");
  });
  it("restores imported scenes to the parent canvas even when their baselines differ", () => {
    const parent =
      '<div data-composition-id="main" data-width="1080" data-height="1920" data-original-width="1440" data-original-height="1080"></div>';
    const child =
      '<div data-composition-id="scene" data-width="1080" data-height="1920" data-original-width="1920" data-original-height="1080"></div>';
    const target = compositionCanvasDimensions(changeCompositionAspect(parent, "Original"));
    const restored = changeCompositionAspect(child, "Original", target);
    expect(compositionCanvasDimensions(restored)).toEqual({ width: 1440, height: 1080 });
    expect(restored).toContain('data-original-width="1920"');
    expect(changeCompositionAspect(child, "Original", target)).toBe(restored);
  });
});
