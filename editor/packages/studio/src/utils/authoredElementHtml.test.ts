// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { authoredElementHtml } from "./authoredElementHtml";

describe("authored preview serialization", () => {
  it("keeps transition intent and authored children while excluding derived pictures", () => {
    const doc = new DOMParser().parseFromString(
      `<html><head><title>Edited</title></head><body>
      <div id="shot" data-source-window data-transition-in=".3"><video id="source" src="source.mp4"></video>
        <div data-hf-visual-transition="before"><video id="temporary" src="neighbour.mp4"></video></div>
        <span id="caption">Text &amp; speech</span>
      </div></body></html>`,
      "text/html",
    );
    const shot = doc.getElementById("shot")!;
    const live = shot.outerHTML;
    const clipboard = authoredElementHtml(shot)!;
    expect(clipboard).toContain('data-transition-in=".3"');
    expect(clipboard).toContain('id="source"');
    expect(clipboard).toContain('id="caption"');
    expect(clipboard).not.toContain("temporary");
    expect(shot.outerHTML).toBe(live);
    const snapshot = authoredElementHtml(doc.documentElement)!;
    expect(snapshot).toContain("<html><head><title>Edited</title>");
    expect(snapshot).not.toContain("data-hf-visual-transition");
    expect(authoredElementHtml(doc.getElementById("temporary"))).toBeNull();
  });
});
