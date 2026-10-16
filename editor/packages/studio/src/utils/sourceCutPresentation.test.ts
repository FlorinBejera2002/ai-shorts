// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseGsapScriptAcorn } from "@hyperframes/core/gsap-parser-acorn";
import { patchCutPresentation } from "./sourceCutPresentation";
import { buildSourceCutChanges } from "./sourceCutChanges";

function scene(id: string, x: number, style: string) {
  return `<html><head></head><body><div id="${id}" data-composition-id="${id}">
    <video id="${id}-video" class="source-video" src="${id}.mp4" data-duration="8" data-media-start="1" data-volume="0.4" style="${style}"></video>
    <audio id="${id}-audio" src="${id}.wav" data-volume="0.3"></audio>
    <p id="${id}-caption">Local caption</p><img id="${id}-logo" src="logo.png">
    </div><script>gsap.set("#${id}-video", {x:${x}, y:20, width:240, volume:0.4});
    const tl = gsap.timeline({paused:true});
    tl.to("#${id}-video", {rotation:10,duration:2}, 1);
    tl.to("#${id}-caption", {opacity:1,duration:0.3}, 0);
    window.__timelines["${id}"] = tl;</script></body></html>`;
}

describe("authored cut presentation", () => {
  it("preserves scene-local masks, linked filters, LUT files and unrecognized Studio attributes", () => {
    const selected = scene(
      "source-scene-1",
      73,
      "clip-path:url(#mask-one);filter:url(#fx-one);opacity:0.6",
    ).replace(
      'data-volume="0.4"',
      `data-volume="0.4" data-hf-studio-cutout-src="one.webm" data-color-grading='{"exposure":0.4,"lut":{"src":"one.cube"}}'`,
    );
    const destination = scene(
      "source-scene-2",
      10,
      "clip-path:url(#mask-two);filter:url(#fx-two);opacity:1",
    ).replace(
      'data-volume="0.4"',
      `data-volume="0.4" data-hf-studio-cutout-src="two.webm" data-color-grading='{"exposure":0,"lut":{"src":"two.cube"}}'`,
    );
    const after = new DOMParser().parseFromString(
      patchCutPresentation(destination, selected),
      "text/html",
    );
    const media = after.querySelector("video")!;
    expect(media.style.clipPath).toContain("#mask-two");
    expect(media.style.filter).toContain("#fx-two");
    expect(media.style.opacity).toBe("0.6");
    expect(media.getAttribute("data-hf-studio-cutout-src")).toBe("two.webm");
    expect(JSON.parse(media.getAttribute("data-color-grading")!)).toEqual({
      exposure: 0.4,
      lut: { src: "two.cube" },
    });
  });
  it("copies saved static geometry and image styling without media, sound, captions or animated tracks", () => {
    const selected = scene(
      "source-scene-1",
      73,
      "opacity:0.6;object-fit:contain;border-radius:12px",
    ).replace('data-volume="0.4"', 'data-volume="0.9" data-hf-studio-rotation="15"');
    const destination = scene("source-scene-2", 10, "opacity:1;object-fit:cover");
    const after = new DOMParser().parseFromString(
      patchCutPresentation(destination, selected),
      "text/html",
    );
    const media = after.querySelector("video")!;
    expect(media.id).toBe("source-scene-2-video");
    expect(media.getAttribute("src")).toBe("source-scene-2.mp4");
    expect(media.getAttribute("data-volume")).toBe("0.4");
    expect(media.getAttribute("data-media-start")).toBe("1");
    expect(media.style.opacity).toBe("0.6");
    expect(media.style.objectFit).toBe("contain");
    expect(media.getAttribute("data-hf-studio-rotation")).toBe("15");
    expect(after.querySelector("audio")!.getAttribute("src")).toBe("source-scene-2.wav");
    const animations = parseGsapScriptAcorn(
      after.querySelector("script")!.textContent!,
    )!.animations;
    expect(animations.some((item) => item.targetSelector.includes("source-scene-1"))).toBe(false);
    expect(animations.find((item) => item.properties.x === 73)?.properties).toMatchObject({
      x: 73,
      y: 20,
      width: 240,
    });
    expect(animations.some((item) => item.properties.volume === 0.4)).toBe(true);
    expect(animations.find((item) => item.properties.rotation === 10)).toMatchObject({
      method: "to",
      duration: 2,
      position: 1,
    });
    expect(animations.find((item) => item.targetSelector.includes("caption"))).toMatchObject({
      method: "to",
      duration: 0.3,
    });
    const result = patchCutPresentation(destination, selected);
    expect(patchCutPresentation(result, selected)).toBe(result);
  });

  it("remaps local sharpen references and preserves destination identifiers", () => {
    const selected = scene(
      "source-scene-1",
      73,
      "filter:url(#source-scene-1-video-cut-sharpen)",
    ).replace(
      "</div><script>",
      '<svg data-cut-sharpen-filter><defs><filter id="source-scene-1-video-cut-sharpen"><feConvolveMatrix kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" /></filter></defs></svg></div><script>',
    );
    const after = new DOMParser().parseFromString(
      patchCutPresentation(scene("source-scene-2", 10, ""), selected),
      "text/html",
    );
    expect(after.querySelector("filter")!.id).toBe("source-scene-2-video-cut-sharpen");
    expect(after.querySelector("video")!.style.filter).toContain(
      "#source-scene-2-video-cut-sharpen",
    );
  });

  it("uses a single history change across destinations, leaving source clocks and selected source bytes intact", () => {
    const selected = scene("source-scene-2", 73, "opacity:0.6");
    const parent =
      '<main><div id="a" data-source-window data-composition-src="source-scene-1.html" data-start="0" data-duration="2" data-playback-start="0"></div><div id="b" data-source-window data-composition-src="source-scene-2.html" data-start="2" data-duration="2" data-playback-start="3"></div></main>';
    const changes = buildSourceCutChanges({
      parentPath: "index.html",
      parentHtml: parent,
      selectedId: "b",
      sources: {
        "source-scene-1.html": scene("source-scene-1", 10, ""),
        "source-scene-2.html": selected,
      },
      existingPaths: ["source-scene-1.html", "source-scene-2.html"],
      applyToAll: true,
      preserveNamespace: true,
      patch: (html, _target, source) => patchCutPresentation(html, source),
    });
    expect(Object.keys(changes.files)).toEqual(["source-scene-1.html"]);
    expect(changes.copies).toEqual({});
    expect(changes.files["source-scene-1.html"].after).toContain('data-media-start="1"');
    expect(changes.files["source-scene-1.html"].after).toContain("x: 73");
  });
});
