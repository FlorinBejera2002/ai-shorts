import { describe, expect, it } from "bun:test";
import { MEDIA_RENDER_ID_ATTR } from "@hyperframes/core";
import { collectRenderMedia } from "./renderMediaCollector.js";
import { parseAutomation, sampleAutomationLane } from "@hyperframes/core/audio-automation";

describe("collectRenderMedia host windows", () => {
  it("prefers canonical duration over a stale source-window end while keeping legacy end limits", () => {
    const media = `<video ${MEDIA_RENDER_ID_ATTR}="source" id="source" src="source.mp4" data-start="0" data-duration="8" data-has-audio="true"></video>`;
    const canonical = collectRenderMedia(
      `<div data-composition-file="scene.html" data-source-window data-start="0" data-duration="2" data-end="1">${media}</div>`,
    );
    expect(canonical.videos[0]?.end).toBe(2);
    expect(canonical.audios[0]?.end).toBe(2);
    const legacy = collectRenderMedia(
      `<div data-composition-file="scene.html" data-start="0" data-duration="2" data-end="1">${media}</div>`,
    );
    expect(legacy.videos[0]?.end).toBe(1);
  });
  it("projects authored music automation with source windows instead of restarting the fade", () => {
    const html = `<div data-composition-file="original.html" data-source-window data-start="0" data-duration="1" data-playback-start="2" data-playback-rate="2"><audio id="music" ${MEDIA_RENDER_ID_ATTR}="music" src="music.wav" data-start="0" data-duration="8" data-media-start="5" data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":4,"v":1},{"t":8,"v":0}]}]}'></audio></div>`;
    const audio = collectRenderMedia(html).audios[0]!;
    const lane = parseAutomation(audio.automation!).lanes[0]!;
    expect(audio.mediaStart).toBe(7);
    expect(sampleAutomationLane(lane, 0)).toBeCloseTo(0.5);
    expect(sampleAutomationLane(lane, 0.5)).toBeCloseTo(0.75);
  });
  it("anchors cut sounds to the cut output clock after source trims, moves and rate changes", () => {
    for (const [start, sourceStart, duration] of [
      [4, 12, 3],
      [8, 45, 0.2],
    ]) {
      const html =
        `<div data-composition-file="scene.html" data-source-window data-start="${start}" data-duration="${duration}" data-playback-start="${sourceStart}" data-playback-rate="2">` +
        `<audio id="effect" ${MEDIA_RENDER_ID_ATTR}="effect" src="effect.wav" data-cut-boundary data-start="0" data-duration="0.45" data-end="0.45" data-volume="0.4"></audio>` +
        `<audio id="camera" ${MEDIA_RENDER_ID_ATTR}="camera" src="camera.mp4" data-start="0" data-duration="60"></audio></div>`;
      const { audios } = collectRenderMedia(html);
      expect(audios.find((audio) => audio.id === "effect")).toMatchObject({
        start,
        end: start + Math.min(duration, 0.45),
        mediaStart: 0,
        playbackRate: 1,
        volume: 0.4,
      });
      expect(audios.find((audio) => audio.id === "camera")).toMatchObject({
        start,
        end: start + duration,
        mediaStart: sourceStart,
        playbackRate: 2,
      });
    }
  });

  it("projects whole-source video and camera audio into an opted-in trimmed scene", () => {
    const html =
      `<div data-composition-file="scene.html" data-source-window data-start="4" data-duration="3" data-playback-start="12">` +
      `<video ${MEDIA_RENDER_ID_ATTR}="source" id="source" src="source.mp4" data-start="0" data-duration="60" data-has-audio="true"></video>` +
      `<audio ${MEDIA_RENDER_ID_ATTR}="camera" id="camera" src="source.mp4" data-start="0" data-duration="60"></audio>` +
      `</div>`;
    const { videos, audios } = collectRenderMedia(html);
    expect(videos[0]).toMatchObject({ start: 4, end: 7, mediaStart: 12, playbackRate: 1 });
    expect(audios).toHaveLength(2);
    for (const audio of audios) {
      expect(audio).toMatchObject({ start: 4, end: 7, mediaStart: 12, playbackRate: 1 });
    }
  });

  it("composes source clocks, source offsets and playback rates through nested hosts", () => {
    const html =
      `<div data-composition-file="outer.html" data-source-window data-start="20" data-duration="2" data-playback-start="5" data-playback-rate="2">` +
      `<div data-composition-file="inner.html" data-source-window data-start="4" data-duration="3" data-playback-start="12">` +
      `<video ${MEDIA_RENDER_ID_ATTR}="source" id="source" src="source.mp4" data-start="10" data-duration="60" data-media-start="20" data-playback-rate="0.5" data-has-audio="true"></video>` +
      `</div></div>`;
    const { videos, audios } = collectRenderMedia(html);
    expect(videos[0]).toMatchObject({ start: 20, end: 21, mediaStart: 21.5, playbackRate: 1 });
    expect(audios[0]).toMatchObject({ start: 20, end: 21, mediaStart: 21.5, playbackRate: 1 });
  });

  it("drops media outside a source window and retains later child starts", () => {
    const html =
      `<div data-composition-file="scene.html" data-source-window data-start="4" data-duration="3" data-playback-start="12">` +
      `<video ${MEDIA_RENDER_ID_ATTR}="before" id="before" src="source.mp4" data-start="0" data-duration="2"></video>` +
      `<video ${MEDIA_RENDER_ID_ATTR}="after" id="after" src="source.mp4" data-start="18" data-duration="2"></video>` +
      `<video ${MEDIA_RENDER_ID_ATTR}="inside" id="inside" src="source.mp4" data-start="13" data-duration="1" data-media-start="5"></video>` +
      `</div>`;
    const { videos } = collectRenderMedia(html);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ id: "inside", start: 5, end: 6, mediaStart: 5 });
  });

  it("does not project serialized runtime media a second time", () => {
    const html =
      `<div data-composition-file="scene.html" data-source-window data-start="4" data-duration="3" data-playback-start="12">` +
      `<video ${MEDIA_RENDER_ID_ATTR}="source" id="source" src="source.mp4" data-start="0" data-duration="3" data-media-start="12" data-source-window-projected></video>` +
      `</div>`;
    expect(collectRenderMedia(html).videos[0]).toMatchObject({ start: 4, end: 7, mediaStart: 12 });
  });

  it("preserves unflagged host playback offsets as legacy metadata", () => {
    const html =
      `<div data-composition-file="scene.html" data-start="4" data-duration="3" data-playback-start="12">` +
      `<video ${MEDIA_RENDER_ID_ATTR}="source" id="source" src="source.mp4" data-start="0" data-duration="60"></video>` +
      `</div>`;
    expect(collectRenderMedia(html).videos[0]).toMatchObject({ start: 4, end: 64, mediaStart: 0 });
  });

  it("schedules nested videos at resolved host id-ref windows", () => {
    const html =
      `<div data-composition-file="hook.html" data-composition-id="hook" data-start="0" data-duration="2">` +
      `<video ${MEDIA_RENDER_ID_ATTR}="red" id="red" src="red.mp4" data-start="0" data-duration="2"></video>` +
      `</div>` +
      `<div data-composition-file="body.html" data-composition-id="body" data-start="hook" data-duration="2">` +
      `<video ${MEDIA_RENDER_ID_ATTR}="blue" id="blue" src="blue.mp4" data-start="0" data-duration="2"></video>` +
      `</div>`;

    const { videos } = collectRenderMedia(html);
    expect(videos.find((v) => v.id === "red")).toMatchObject({ start: 0, end: 2 });
    expect(videos.find((v) => v.id === "blue")).toMatchObject({ start: 2, end: 4 });
  });

  it("preserves an explicitly marked legacy-global media window", () => {
    const html =
      `<div data-composition-file="scene.html" data-composition-id="scene" data-start="2" data-duration="6">` +
      `<video ${MEDIA_RENDER_ID_ATTR}="local" id="local" src="local.mp4" data-start="2" data-duration="2" data-has-audio="true"></video>` +
      `<video ${MEDIA_RENDER_ID_ATTR}="global" id="global" src="global.mp4" data-start="2" data-duration="2" data-hf-media-start-basis="global" data-has-audio="true"></video>` +
      `</div>`;

    const { videos, audios } = collectRenderMedia(html);
    expect(videos.find((video) => video.id === "local")).toMatchObject({ start: 4, end: 6 });
    expect(videos.find((video) => video.id === "global")).toMatchObject({ start: 2, end: 4 });
    expect(audios.find((audio) => audio.id === "local-audio")).toMatchObject({ start: 4, end: 0 });
    expect(audios.find((audio) => audio.id === "global-audio")).toMatchObject({ start: 2, end: 0 });
  });
});
