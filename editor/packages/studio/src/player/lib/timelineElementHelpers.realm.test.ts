// @vitest-environment happy-dom
import { Window } from "happy-dom";
import { expect, it } from "vitest";
import {
  applyMediaMetadataFromElement,
  getTimelineElementSelector,
  resolveMediaElement,
} from "./timelineElementHelpers";
import type { TimelineElement } from "../store/playerStore";

it("reads source hosts and footage adopted from a different window", () => {
  const foreign = new Window();
  // Happy DOM shares constructor bases between windows. Give the destination
  // distinct constructors to model Chromium's measured iframe realm boundary.
  for (const name of ["HTMLElement", "HTMLMediaElement", "HTMLImageElement"]) {
    Object.defineProperty(foreign, name, {
      value: class DestinationElement {},
      configurable: true,
    });
  }
  const source = document.createElement("div");
  source.innerHTML = `<div id="scene-1" data-source-window data-composition-id="source-scene-1"
    data-playback-start="1" data-source-duration="6"><video src="assets/source-1.mp4"></video></div>`;
  const host = source.firstElementChild as HTMLElement;
  foreign.document.body.appendChild(host as unknown as import("happy-dom").HTMLElement);
  const video = host.querySelector("video")!;
  try {
    expect(host.ownerDocument).toBe(foreign.document);
    expect(host instanceof HTMLElement).toBe(true);
    expect(host instanceof foreign.HTMLElement).toBe(false);
    expect(video instanceof foreign.HTMLMediaElement).toBe(false);
    expect(getTimelineElementSelector(host)).toBe("#scene-1");
    expect(resolveMediaElement(host)).toBe(video);
    const row: TimelineElement = { id: "scene-1", tag: "div", start: 0, duration: 2, track: 0 };
    applyMediaMetadataFromElement(row, host);
    expect(row).toMatchObject({
      tag: "video",
      src: "assets/source-1.mp4",
      sourceWindow: true,
      playbackStart: 1,
      sourceDuration: 6,
      duration: 2,
    });
  } finally {
    host.remove();
    foreign.close();
  }
});
