// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { lowerVisualTransitions, syncVisualTransitions } from "./visualTransitions";
import { projectSourceCompositionWindows } from "./runtime/sourceCompositionWindow";
import { collectRuntimeTimelinePayload } from "./runtime/timeline";
import { createClipTree } from "./runtime/clipTree";

const markup = `<div id="main" data-composition-id="main" data-duration="3">
  <div id="a" data-canonical-scene="a" data-canonical-asset="red" data-source-window data-composition-id="source-a" data-start="0" data-duration="1" data-playback-start="0.5" data-source-duration="2">
    <video id="picture-a" data-canonical-scene="a" src="red.mp4" data-start="0" data-duration="2" style="object-fit:cover;width:200%;height:100%;left:-20px"></video>
    <audio id="speech-a" data-start="0" data-duration="2"></audio><span id="caption-a" data-start=".8" data-duration=".5" style="z-index:2000">speech</span>
  </div>
  <div id="b" data-canonical-scene="b" data-canonical-asset="blue" data-source-window data-composition-id="source-b" data-start="1" data-duration="1" data-playback-start=".5" data-source-duration="2" data-transition-in=".3">
    <video id="picture-b" data-canonical-scene="b" src="blue.mp4" data-start="0" data-duration="2" style="object-fit:contain"></video>
    <audio id="speech-b" data-start="0" data-duration="2"></audio>
  </div>
  <div id="c" data-canonical-scene="c" data-canonical-asset="green" data-source-window data-composition-id="source-c" data-start="2" data-duration="1" data-playback-start="0" data-source-duration="1">
    <video id="picture-c" data-canonical-scene="c" src="green.mp4" data-start="0" data-duration="1"></video>
  </div>
</div>`;
const fixture = () => new DOMParser().parseFromString(markup, "text/html");
const layers = (doc: Document) =>
  Array.from(doc.querySelectorAll<HTMLElement>("[data-hf-visual-transition]"));
const picture = (doc: Document, side: string) =>
  doc.querySelector<HTMLVideoElement>(`[data-hf-visual-transition="${side}"] video`)!;

describe("native source-window visual transitions", () => {
  it("uses only included boundary pictures, no speech or caption copies, and stays beneath captions", () => {
    const doc = fixture();
    const originals = ["a", "b", "speech-a", "speech-b", "caption-a"].map(
      (id) => doc.getElementById(id)!.outerHTML,
    );
    lowerVisualTransitions(doc);
    expect(layers(doc)).toHaveLength(2);
    expect(doc.querySelectorAll("audio")).toHaveLength(2);
    expect(doc.querySelectorAll("#caption-a")).toHaveLength(1);
    expect(picture(doc, "before").getAttribute("data-freeze-at")).toBe("0.5");
    expect(Number(picture(doc, "after").getAttribute("data-freeze-at"))).toBeCloseTo(
      1.5 - 0.000001,
      8,
    );
    expect(picture(doc, "before").getAttribute("data-has-audio")).toBe("false");
    expect(layers(doc).map((layer) => layer.parentElement!.id)).toEqual(["a", "b"]);
    expect(layers(doc).every((layer) => Number(layer.style.zIndex) < 2000)).toBe(true);
    layers(doc).forEach((layer) => layer.remove());
    expect(
      ["a", "b", "speech-a", "speech-b", "caption-a"].map(
        (id) => doc.getElementById(id)!.outerHTML,
      ),
    ).toEqual(originals);
  });

  it("is deterministic through backward seeks and never fades both opaque base pictures", () => {
    const doc = fixture();
    lowerVisualTransitions(doc);
    projectSourceCompositionWindows(doc);
    const sample = (time: number) => {
      syncVisualTransitions(doc, time);
      return layers(doc).map((layer) => Number(layer.style.opacity));
    };
    expect(sample(0.85)).toEqual([0, 0]);
    expect(sample(1)).toEqual([0, 0.5]);
    expect(sample(1.15)).toEqual([0, 0]);
    const middle = sample(0.925);
    expect(middle[0]).toBeCloseTo(0.15625);
    expect(sample(0.925)).toEqual(middle);
    expect(doc.getElementById("picture-a")!.getAttribute("style")).not.toContain("opacity");
    expect(picture(doc, "after").style.width).toBe("200%");
    expect(picture(doc, "after").style.left).toBe("-20px");
  });

  it("rebuilds from current trim, source offset, rate and reordered neighbour without cumulative projection", () => {
    const doc = fixture();
    lowerVisualTransitions(doc);
    projectSourceCompositionWindows(doc);
    const initial = picture(doc, "before");
    lowerVisualTransitions(doc);
    projectSourceCompositionWindows(doc);
    expect(picture(doc, "before")).toBe(initial);
    expect(Number(initial.getAttribute("data-start"))).toBeCloseTo(0.85);
    const a = doc.getElementById("a")!;
    a.setAttribute("data-start", "2");
    const c = doc.getElementById("c")!;
    c.setAttribute("data-start", "0");
    const b = doc.getElementById("b")!;
    b.setAttribute("data-duration", ".2");
    b.setAttribute("data-playback-start", ".7");
    b.setAttribute("data-playback-rate", "2");
    lowerVisualTransitions(doc);
    projectSourceCompositionWindows(doc);
    expect(picture(doc, "before")).not.toBe(initial);
    expect(picture(doc, "after").getAttribute("src")).toBe("green.mp4");
    expect(Number(picture(doc, "after").getAttribute("data-freeze-at"))).toBeCloseTo(
      1 - 0.000001,
      8,
    );
    expect(picture(doc, "before").getAttribute("data-freeze-at")).toBe("0.7");
    expect(Number(picture(doc, "after").getAttribute("data-duration"))).toBeCloseTo(0.05);
    // A gap removes the derived effect instead of leaving detached overlays.
    b.setAttribute("data-start", "1.5");
    lowerVisualTransitions(doc);
    expect(layers(doc)).toHaveLength(0);
  });

  it("keeps explicit fades and motion bridges, and skips newly contiguous source selections", () => {
    const doc = fixture();
    doc.getElementById("a")!.setAttribute("data-transition-blocked", "");
    lowerVisualTransitions(doc);
    expect(layers(doc)).toHaveLength(0);
    doc.getElementById("a")!.removeAttribute("data-transition-blocked");
    const b = doc.getElementById("b")!;
    b.setAttribute("data-canonical-asset", "red");
    b.setAttribute("data-playback-start", "1.5");
    lowerVisualTransitions(doc);
    expect(layers(doc)).toHaveLength(0);
  });

  it("lowers the same two media windows in the producer's linkedom document", () => {
    const { document } = parseHTML(`<!doctype html><html><body>${markup}</body></html>`);
    lowerVisualTransitions(document as unknown as Document);
    const videos = document.querySelectorAll("[data-hf-visual-transition] video");
    expect(videos).toHaveLength(2);
    expect(videos[0]!.getAttribute("data-start")).toBe("1.35");
    expect(videos[1]!.getAttribute("data-start")).toBe("0.5");
  });

  it("preserves compiled render identities when media URLs are localized", () => {
    const doc = fixture();
    lowerVisualTransitions(doc);
    const before = picture(doc, "before");
    before.setAttribute("data-hf-render-id", "render-3");
    doc.getElementById("picture-b")!.setAttribute("src", "assets/local-blue.mp4");
    lowerVisualTransitions(doc);
    expect(picture(doc, "before")).toBe(before);
    expect(before.getAttribute("data-hf-render-id")).toBe("render-3");
    expect(before.getAttribute("src")).toBe("assets/local-blue.mp4");
  });

  it("publishes only authored shots in the Studio timeline and clip tree", () => {
    document.body.innerHTML = markup;
    try {
      lowerVisualTransitions(document);
      projectSourceCompositionWindows(document);
      const payload = collectRuntimeTimelinePayload({ canonicalFps: 30 });
      expect(payload.clips.some((clip) => clip.id.startsWith("hf-transition-"))).toBe(false);
      const tree = createClipTree({
        startResolver: { resolveStartForElement: () => 0 },
        timelineRegistry: {},
        rootDuration: 3,
      });
      expect(
        JSON.stringify(tree, (key, value) => (key === "element" ? undefined : value)),
      ).not.toContain("hf-transition-");
    } finally {
      document.body.innerHTML = "";
    }
  });
});
