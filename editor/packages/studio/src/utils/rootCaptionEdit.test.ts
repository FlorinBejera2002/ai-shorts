// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { planRootCaptionEdit, syncRootCaptionEdit } from "./rootCaptionEdit";

const host = (id: number) =>
  `<div id="scene-${id}" data-source-window data-composition-src="source-scene-${id}.html" data-start="${id - 1}" data-duration="1"></div>`;
const html = `<!doctype html><html><body><div data-composition-id="main">${host(1)}${host(2)}${host(3)}<div class="clip story-caption" id="caption" data-start="0" data-duration="3" style="font-size:40px" data-caption-style='{"preset":"phrase-pop"}'><span data-caption-text><span id="word" data-caption-word-start="0" data-caption-word-end="3">Hello</span></span></div></div><script>window.__timelines["main"]=gsap.timeline({paused:true});window.__timelines["main"].fromTo("#caption .story-caption-text",{scale:.88},{scale:1,duration:.12},0);</script></body></html>`;
const parse = (text: string) => new DOMParser().parseFromString(text, "text/html");

function fixture() {
  const doc = parse(html);
  const element = doc.getElementById("caption")!;
  const selection = {
    element,
    id: "caption",
    selector: "#caption",
    sourceFile: "index.html",
  } as DomEditSelection;
  return { doc, element, selection };
}

describe("direct root narration edits", () => {
  it("isolates the current cut, keeps the selected ID and original animation phase", () => {
    const { selection } = fixture();
    const result = planRootCaptionEdit(
      html,
      selection,
      [{ type: "inline-style", property: "font-size", value: "80px" }],
      1.5,
    )!;
    const doc = parse(result.after);
    const selected = doc.getElementById("caption")!;
    expect(selected.getAttribute("data-start")).toBe("1");
    expect(selected.getAttribute("data-duration")).toBe("1");
    expect(selected.style.fontSize).toBe("80px");
    expect(
      [...doc.querySelectorAll<HTMLElement>("[data-caption-split-origin]")].map(
        (node) => node.style.fontSize,
      ),
    ).toEqual(["40px", "40px"]);
    expect(doc.getElementById("word")!.getAttribute("data-caption-word-start")).toBe("0");
    expect(result.after).toContain('ease:"none"},0)');
    expect(result.after).not.toContain('ease:"none"},1)');
  });
  it("keeps preview selection and neighbours intact while installing split cues", () => {
    const { selection, element, doc } = fixture();
    const scene = doc.getElementById("scene-2");
    const result = planRootCaptionEdit(
      html,
      selection,
      [{ type: "inline-style", property: "font-size", value: "80px" }],
      1.5,
    )!;
    element.style.fontSize = "80px"; // The gesture has already painted its draft.
    syncRootCaptionEdit(selection, result, "index.html");
    expect(doc.getElementById("caption")).toBe(element);
    expect(selection.element).toBe(element);
    expect(doc.getElementById("scene-2")).toBe(scene);
    expect(doc.querySelectorAll(".story-caption")).toHaveLength(3);
    expect(doc.getElementById("caption")!.style.fontSize).toBe("80px");
    expect(
      [...doc.querySelectorAll("[data-caption-split-origin]")].map((node) =>
        node.getAttribute("data-composition-file"),
      ),
    ).toEqual(["index.html", "index.html"]);
  });
  it("keeps subsequent edits in the isolated segment and sanitizes rich text", () => {
    const { selection } = fixture();
    const first = planRootCaptionEdit(
      html,
      selection,
      [{ type: "inline-style", property: "font-size", value: "80px" }],
      1.5,
    )!;
    const updated = parse(first.after);
    const next = { ...selection, element: updated.getElementById("caption")! };
    const second = planRootCaptionEdit(
      first.after,
      next,
      [
        {
          type: "rich-text",
          property: "html",
          value: "<strong>Changed</strong><script>bad()</script>",
        },
      ],
      1.5,
    )!;
    expect(parse(second.after).querySelectorAll(".story-caption")).toHaveLength(3);
    expect(parse(second.after).getElementById("caption")!.textContent).toBe("Changed");
    expect(second.after).not.toContain("bad()");
    expect(second.split).toBe(false);
  });
});
