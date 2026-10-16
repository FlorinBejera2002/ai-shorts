// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ensureHfIds } from "@hyperframes/parsers/hf-ids";
import { patchSourceCaptions, readSourceCaptionSettings } from "./sourceCutCaptions";
import { buildSourceCutChanges } from "./sourceCutChanges";

const source = ensureHfIds(
  `<!doctype html><html><head><style>.story-caption{font-size:54px;-webkit-text-stroke:3px #123456}.story-caption-text{background:#112233dd}.story-caption-active{background:#FFE066}</style></head><body><div data-composition-id="main"><video id="video" src="speech.mp4"></video><div class="clip story-caption" id="caption" data-start="0" data-duration="3"><span class="story-caption-text"><span id="word1" class="story-caption-active" data-caption-word-start="0" data-caption-word-end="1">Hello</span> <span id="word2" data-caption-word-start="1" data-caption-word-end="3">world</span></span></div></div><script>window.__timelines["main"]=gsap.timeline({paused:true});window.__timelines["main"].set("#video",{x:2},0);window.__timelines["main"].fromTo("#caption .story-caption-text",{scale:.88},{scale:1,duration:.12},0);</script></body></html>`,
);
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("editable generated caption settings", () => {
  it("turns effects off independently and restores chosen appearance", () => {
    const off = patchSourceCaptions(
      patchSourceCaptions(patchSourceCaptions(source, "outline", false), "background", false),
      "activeWord",
      false,
    );
    expect(readSourceCaptionSettings(off)).toMatchObject({
      outline: false,
      background: false,
      activeWord: false,
      animation: "phrase-pop",
    });
    const doc = parse(off);
    expect(
      doc
        .querySelector<HTMLElement>(".story-caption")!
        .style.getPropertyValue("-webkit-text-stroke"),
    ).toBe("0px transparent");
    expect(doc.querySelector<HTMLElement>("[data-caption-text]")!.style.background).toBe(
      "transparent",
    );
    expect(doc.querySelector(".story-caption-active")).toBeNull();
    const restored = patchSourceCaptions(
      patchSourceCaptions(patchSourceCaptions(off, "outline", true), "background", true),
      "activeWord",
      true,
    );
    expect(
      parse(restored)
        .querySelector<HTMLElement>(".story-caption")!
        .style.getPropertyValue("-webkit-text-stroke"),
    ).toBe("3px #123456");
    expect(parse(restored).querySelector(".story-caption-active")).not.toBeNull();
    expect(restored).toContain("#112233dd");
  });
  it("replaces entrance tweens while preserving media, speech and crop animation", () => {
    const result = patchSourceCaptions(source, "animation", "word-pop");
    expect(result).toContain("{opacity:0,scale:.8}");
    expect(result).not.toContain("scale:.88");
    expect(result).toContain('.set("#video",{x:2},0)');
    expect(parse(result).querySelector("video")!.outerHTML).toBe(
      parse(source).querySelector("video")!.outerHTML,
    );
    expect(parse(result).querySelector("#word2")!.getAttribute("data-caption-word-start")).toBe(
      "1",
    );
    expect(patchSourceCaptions(result, "animation", "none")).not.toContain("scale:.8");
  });
  it("changes font size rather than only the text box", () => {
    const result = patchSourceCaptions(source, "size", 96);
    expect(parse(result).querySelector<HTMLElement>(".story-caption")!.style.fontSize).toBe("96px");
    expect(readSourceCaptionSettings(result)?.size).toBe(96);
  });
  it("isolates root narration styling to the selected cut without changing word clocks", () => {
    const result = patchSourceCaptions(source, "size", 90, [
      { id: "scene2", path: "source-scene-2.html", start: 1, sourceStart: 0, duration: 1 },
    ]);
    const cues = [...parse(result).querySelectorAll<HTMLElement>(".story-caption")];
    expect(
      cues.map((cue) => [
        cue.getAttribute("data-start"),
        cue.getAttribute("data-duration"),
        cue.style.fontSize,
      ]),
    ).toEqual([
      ["0", "1", ""],
      ["1", "1", "90px"],
      ["2", "1", ""],
    ]);
    expect(
      cues[1]!
        .querySelector("[data-caption-word-start='1']")!
        .getAttribute("data-caption-word-end"),
    ).toBe("3");
    expect(new Set([...parse(result).querySelectorAll("[id]")].map((node) => node.id)).size).toBe(
      parse(result).querySelectorAll("[id]").length,
    );
    const ids = [...parse(result).querySelectorAll("[data-hf-id]")].map((node) =>
      node.getAttribute("data-hf-id"),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(parse(ensureHfIds(result)).querySelectorAll("[data-hf-id]").length).toBe(ids.length);
  });
  it("isolates a selected reused source and supports explicit Apply all", () => {
    const host = (id: string, start: number) =>
      `<div id="${id}" data-source-window data-composition-src="source-scene-1.html" data-start="${start}" data-duration="1" data-playback-start="${start}"></div>`;
    const parent = host("first", 0) + host("second", 1);
    const args = {
      parentPath: "index.html",
      parentHtml: parent,
      selectedId: "second",
      sources: { "source-scene-1.html": source },
      existingPaths: ["source-scene-1.html"],
      patch: (html: string) => patchSourceCaptions(html, "size", 80),
    };
    const single = buildSourceCutChanges(args);
    expect(single.files["source-scene-1.html"]).toBeUndefined();
    expect(Object.keys(single.copies)).toHaveLength(1);
    const all = buildSourceCutChanges({ ...args, applyToAll: true });
    expect(Object.keys(all.copies)).toHaveLength(0);
    expect(readSourceCaptionSettings(all.files["source-scene-1.html"]!.after)?.size).toBe(80);
  });
});
