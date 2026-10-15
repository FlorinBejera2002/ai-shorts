// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { projectSourceCompositionWindows } from "./sourceCompositionWindow";
import { parseAutomation, sampleAutomationLane } from "../audioAutomation";

describe("source composition windows", () => {
  it("keeps ducking and fades on the original clock through trims, rate changes and extension", () => {
    const doc = new DOMParser().parseFromString(
      `<div id="host" data-source-window data-start="0" data-duration="1" data-playback-start="2" data-playback-rate="2"><audio id="music" data-start="0" data-duration="8" data-media-start="5" data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":4,"v":1},{"t":8,"v":0}]}]}'></audio></div>`,
      "text/html",
    );
    const audio = doc.getElementById("music")!;
    const gain = (time: number) =>
      sampleAutomationLane(parseAutomation(audio.getAttribute("data-automation")!).lanes[0]!, time);
    projectSourceCompositionWindows(doc);
    expect(gain(0)).toBeCloseTo(0.5);
    expect(gain(0.5)).toBeCloseTo(0.75);
    projectSourceCompositionWindows(doc);
    expect(gain(0)).toBeCloseTo(0.5);
    doc.getElementById("host")!.setAttribute("data-playback-start", "0");
    doc.getElementById("host")!.setAttribute("data-playback-rate", "1");
    projectSourceCompositionWindows(doc);
    expect(gain(0)).toBe(0);
    expect(gain(0.5)).toBeCloseTo(0.125);
  });
  it("projects nested scenes without republishing stripped timing or waking an observer", async () => {
    const doc = new DOMParser().parseFromString(
      `<div id="original" data-source-window data-composition-id="original" data-start="0" data-duration="1" data-playback-start=".75">
      <div id="first" data-source-window data-composition-id="first" data-start="0" data-duration="1" data-playback-start="0"><video id="a" data-start="0" data-duration="4" data-media-start="0"></video></div>
      <div id="second" data-source-window data-composition-id="second" data-start="1" data-duration="1" data-playback-start="1"><video id="b" data-start="0" data-duration="4" data-media-start="0"></video></div>
    </div>`,
      "text/html",
    );
    projectSourceCompositionWindows(doc);
    expect(doc.getElementById("first")?.getAttribute("data-duration")).toBe("0.25");
    expect(doc.getElementById("second")?.getAttribute("data-start")).toBe("0.25");
    expect(doc.getElementById("second")?.getAttribute("data-duration")).toBe("0.75");
    expect(doc.getElementById("a")?.getAttribute("data-media-start")).toBe("0.75");
    expect(doc.getElementById("b")?.getAttribute("data-media-start")).toBe("1");
    // The runtime preserves and strips composition timing when it publishes.
    for (const id of ["first", "second"]) {
      const host = doc.getElementById(id)!;
      host.setAttribute("data-hf-authored-duration", host.getAttribute("data-duration")!);
      host.removeAttribute("data-duration");
      host.removeAttribute("data-end");
    }
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(doc.body, { attributes: true, subtree: true });
    projectSourceCompositionWindows(doc);
    await Promise.resolve();
    projectSourceCompositionWindows(doc);
    await Promise.resolve();
    observer.disconnect();
    expect(mutations).toHaveLength(0);
    expect(doc.getElementById("second")?.getAttribute("data-start")).toBe("0.25");
    expect(doc.getElementById("second")?.hasAttribute("data-duration")).toBe(false);
    doc.getElementById("original")!.setAttribute("data-playback-start", "0");
    doc.getElementById("original")!.setAttribute("data-duration", "2");
    projectSourceCompositionWindows(doc);
    expect(doc.getElementById("second")?.getAttribute("data-start")).toBe("1");
    expect(doc.getElementById("second")?.getAttribute("data-hf-authored-duration")).toBe("1");
    expect(doc.getElementById("a")?.getAttribute("data-media-start")).toBe("0");
  });

  it("applies a live end-based trim before the next runtime publication", () => {
    const doc = new DOMParser().parseFromString(
      `<div id="host" data-source-window data-start="0" data-hf-authored-duration="2" data-playback-start="1">
        <video id="video" data-start="0" data-duration="6" data-media-start="0"></video>
      </div>`,
      "text/html",
    );
    projectSourceCompositionWindows(doc);
    const host = doc.getElementById("host")!;
    host.setAttribute("data-start", "0.39");
    host.setAttribute("data-end", "2");
    host.setAttribute("data-playback-start", "1.39");
    projectSourceCompositionWindows(doc);
    const video = doc.getElementById("video")!;
    expect(Number(video.getAttribute("data-duration"))).toBeCloseTo(1.61);
    expect(Number(video.getAttribute("data-media-start"))).toBeCloseTo(1.39);
  });
  it("keeps media and caption visibility aligned across repeated trims and extension", () => {
    const doc = new DOMParser().parseFromString(
      `<div data-composition-id="main">
      <div id="host" data-source-window data-composition-id="scene" data-start="2" data-duration="2" data-playback-start="1">
        <video id="video" data-start="0" data-duration="6" data-media-start="0"></video>
        <audio id="audio" data-start="0" data-duration="6" data-media-start="0"></audio>
        <div id="caption" data-start="1.2" data-duration="0.6">Hello</div>
        <div id="later" data-start="4" data-duration="1">Later</div>
      </div></div>`,
      "text/html",
    );
    const host = doc.getElementById("host")!;
    const video = doc.getElementById("video")!;
    const audio = doc.getElementById("audio")!;
    const caption = doc.getElementById("caption")!;
    const later = doc.getElementById("later")!;
    projectSourceCompositionWindows(doc);
    expect(video.getAttribute("data-media-start")).toBe("1");
    expect(audio.getAttribute("data-media-start")).toBe("1");
    expect(Number(caption.getAttribute("data-start"))).toBeCloseTo(0.2);
    expect(later.hasAttribute("data-hidden")).toBe(true);
    host.setAttribute("data-playback-start", "1.5");
    host.setAttribute("data-duration", "1.5");
    projectSourceCompositionWindows(doc);
    expect(video.getAttribute("data-media-start")).toBe("1.5");
    expect(video.getAttribute("data-duration")).toBe("1.5");
    expect(audio.getAttribute("data-media-start")).toBe("1.5");
    expect(caption.getAttribute("data-start")).toBe("0");
    expect(Number(caption.getAttribute("data-duration"))).toBeCloseTo(0.3);
    host.setAttribute("data-playback-start", "0");
    host.setAttribute("data-duration", "6");
    projectSourceCompositionWindows(doc);
    expect(video.getAttribute("data-media-start")).toBe("0");
    expect(video.getAttribute("data-duration")).toBe("6");
    expect(later.hasAttribute("data-hidden")).toBe(false);
    expect(later.getAttribute("data-start")).toBe("4");
  });

  it("leaves ordinary compositions and directly opened source files untouched", () => {
    const doc = new DOMParser().parseFromString(
      '<div data-composition-id="source"><video data-start="0" data-duration="6" data-media-start="0"></video></div>',
      "text/html",
    );
    const before = doc.documentElement.outerHTML;
    projectSourceCompositionWindows(doc);
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("keeps projecting after Studio persists end-based timing and pins cut sound effects to the cut", () => {
    const doc = new DOMParser().parseFromString(
      `<div data-source-window data-start="2" data-end="3.5" data-playback-start="3" data-playback-rate="2">
      <video id="video" data-start="0" data-end="8"></video>
      <audio id="effect" data-cut-boundary data-start="0" data-end="0.3"></audio>
    </div>`,
      "text/html",
    );
    projectSourceCompositionWindows(doc);
    expect(doc.getElementById("video")?.getAttribute("data-media-start")).toBe("3");
    expect(doc.getElementById("video")?.getAttribute("data-duration")).toBe("1.5");
    expect(doc.getElementById("video")?.getAttribute("data-playback-rate")).toBe("2");
    const effect = doc.getElementById("effect")!;
    expect(effect.getAttribute("data-start")).toBe("0");
    expect(effect.getAttribute("data-media-start")).toBe("0");
    expect(effect.getAttribute("data-duration")).toBe("0.3");
    expect(effect.getAttribute("data-playback-rate")).toBe("1");
    expect(effect.hasAttribute("data-hidden")).toBe(false);
    const host = doc.querySelector("[data-source-window]")!;
    host.removeAttribute("data-end");
    host.setAttribute("data-hf-authored-duration", "1");
    host.setAttribute("data-playback-start", "4");
    projectSourceCompositionWindows(doc);
    expect(doc.getElementById("video")?.getAttribute("data-media-start")).toBe("4");
    expect(doc.getElementById("video")?.getAttribute("data-duration")).toBe("1");
  });
});
