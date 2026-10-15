import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { timelineElementsChanged } from "./timelinePlayerSync";

const host: TimelineElement = {
  id: "scene-1",
  tag: "div",
  start: 0,
  duration: 4,
  track: 0,
  sourceDuration: 40,
};

describe("timeline source metadata hydration", () => {
  it("publishes the loaded source video even when its timing and duration were already known", () => {
    expect(
      timelineElementsChanged(
        [host],
        [
          {
            ...host,
            tag: "video",
            src: "assets/clip.mp4",
            compositionSrc: "source-scene-1.html",
            sourceWindow: true,
          },
        ],
      ),
    ).toBe(true);
  });

  it.each<Partial<TimelineElement>>([
    { tag: "video" },
    { src: "assets/replacement.mp4" },
    { compositionSrc: "source-scene-2.html" },
    { sourceWindow: true },
    { playbackStart: 20 },
    { playbackRate: 2 },
  ])("updates a changed media descriptor %j without requiring a timeline edit", (metadata) => {
    expect(timelineElementsChanged([host], [{ ...host, ...metadata }])).toBe(true);
  });

  it("keeps an unchanged hydrated source stable", () => {
    const source = {
      ...host,
      tag: "video",
      src: "assets/clip.mp4",
      sourceWindow: true,
      playbackStart: 20,
    };
    expect(timelineElementsChanged([source], [{ ...source }])).toBe(false);
  });
});
