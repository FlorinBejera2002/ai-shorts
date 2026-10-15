// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { observeSourceSceneMedia } from "./sourceSceneMediaObserver";
import { buildMissingCompositionElements } from "./timelineIframeHelpers";
import type { IframeWindow } from "./playbackTypes";
import type { TimelineElement } from "../store/playerStore";

describe("paused source scene media hydration", () => {
  it("publishes late nested video for an already-known scene without Play or timeline messages", async () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<main data-composition-id="root" data-duration="46">
      <div id="scene-1" data-composition-id="source-scene-1" data-composition-src="source-scene-1.html"
        data-source-window data-start="0" data-duration="4" data-playback-start="20" data-playback-rate="2"></div></main>`;
    const host = doc.getElementById("scene-1")!;
    let rows: TimelineElement[] = [
      {
        id: "scene-1",
        domId: "scene-1",
        tag: "div",
        start: 0,
        duration: 4,
        track: 0,
        compositionSrc: "source-scene-1.html",
      },
    ];
    const publish = vi.fn(() => {
      rows = buildMissingCompositionElements(doc, window as IframeWindow, rows, 46).updatedEls;
    });
    const stop = observeSourceSceneMedia(doc, publish);
    try {
      await vi.waitFor(() => expect(rows[0].sourceWindow).toBe(true));
      expect(rows[0].src).toBeUndefined();
      const video = doc.createElement("video");
      video.src = "/api/projects/demo/preview/assets/source.mp4";
      video.setAttribute("data-source-duration", "40");
      host.append(video);
      await vi.waitFor(() =>
        expect(rows[0].src).toBe("/api/projects/demo/preview/assets/source.mp4"),
      );
      expect(rows[0]).toMatchObject({
        tag: "video",
        duration: 4,
        playbackStart: 20,
        playbackRate: 2,
        sourceDuration: 40,
      });
      video.setAttribute("src", "/api/projects/demo/preview/assets/replaced.mp4");
      await vi.waitFor(() => expect(rows[0].src).toContain("replaced.mp4"));
      const stable = buildMissingCompositionElements(doc, window as IframeWindow, rows, 46);
      expect(stable.patched).toBe(false);
      expect(stable.updatedEls[0]).toBe(rows[0]);
    } finally {
      stop();
    }
    const count = publish.mock.calls.length;
    host.append(doc.createElement("video"));
    host.dispatchEvent(new Event("loadedmetadata"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(publish).toHaveBeenCalledTimes(count);
  });

  it("ignores ordinary compositions and cancels its queued callback on reload", async () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<div data-composition-id="root"><video src="clip.mp4"></video></div>';
    const publish = vi.fn();
    observeSourceSceneMedia(doc, publish)();
    doc.body.innerHTML = "<div data-source-window></div>";
    observeSourceSceneMedia(doc, publish)();
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
  });
});
