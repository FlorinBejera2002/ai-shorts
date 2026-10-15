// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { changeCompositionAspect, importedScenePaths } from "./compositionAspectRatio";

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
});
