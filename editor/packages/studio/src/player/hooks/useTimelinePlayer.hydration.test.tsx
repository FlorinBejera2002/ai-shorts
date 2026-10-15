// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useTimelinePlayer } from "./useTimelinePlayer";
import { usePlayerStore } from "../store/playerStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
});

it("hydrates initial and reloaded source documents before their iframe load events", async () => {
  usePlayerStore.getState().reset();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let player!: ReturnType<typeof useTimelinePlayer>;
  function Harness() {
    player = useTimelinePlayer();
    return null;
  }
  act(() => root.render(<Harness />));
  const iframe = document.createElement("iframe");
  Object.defineProperty(iframe, "contentWindow", { value: window, configurable: true });
  player.iframeRef.current = iframe;
  try {
    for (const filename of ["source-1.mp4", "reloaded-source.mp4"]) {
      const doc = document.implementation.createHTMLDocument("loading preview");
      doc.body.innerHTML = `<main data-composition-id="root" data-duration="4">
    <div id="scene-1" data-composition-id="source-scene-1" data-source-window
      data-composition-src="source-scene-1.html" data-start="0" data-duration="2"
      data-playback-start="1" data-source-duration="6"></div></main>`;
      Object.defineProperty(iframe, "contentDocument", { value: doc, configurable: true });
      act(() =>
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              source: "hf-preview",
              type: "timeline",
              durationInFrames: 120,
              clips: [
                {
                  id: "scene-1",
                  label: "Color source",
                  kind: "composition",
                  tagName: "div",
                  compositionId: "source-scene-1",
                  compositionSrc: "source-scene-1.html",
                  parentCompositionId: null,
                  assetUrl: "source-scene-1.html",
                  start: 0,
                  duration: 2,
                  track: 0,
                },
              ],
            },
          }),
        ),
      );
      expect(usePlayerStore.getState().elements[0]).toMatchObject({
        sourceWindow: true,
        tag: "div",
      });
      // A nested source resolves while another resource still delays iframe load.
      // No onIframeLoad(), state tick, seek or Play should be needed to show it.
      await act(async () => {
        const video = doc.createElement("video");
        video.src = `assets/${filename}`;
        video.setAttribute("data-source-duration", "6");
        doc.getElementById("scene-1")!.append(video);
        await vi.waitFor(() =>
          expect(usePlayerStore.getState().elements[0]).toMatchObject({
            tag: "video",
            src: `assets/${filename}`,
            playbackStart: 1,
            duration: 2,
          }),
        );
      });
    }
  } finally {
    act(() => root.unmount());
  }
});
