import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { assignMediaRenderIds } from "@hyperframes/core/compiler";
import { lowerVisualTransitions } from "@hyperframes/core/visual-transitions";
import { collectRenderMedia } from "./renderMediaCollector";

test("native transition extraction preserves source, speech and output clocks", () => {
  const { document } = parseHTML(`<!doctype html><html><body><div data-composition-id="main">
    <div id="a" data-canonical-scene="a" data-canonical-asset="red" data-source-window data-composition-file="a.html" data-start="0" data-duration="1" data-playback-start=".5">
      <video id="a-video" data-canonical-scene="a" data-start="0" data-duration="2" src="red.mp4" data-has-audio="false"></video>
      <audio id="speech" data-start="0" data-duration="2" src="speech.wav"></audio>
    </div>
    <div id="b" data-canonical-scene="b" data-canonical-asset="blue" data-source-window data-composition-file="b.html" data-start="1" data-duration="1" data-playback-start=".5" data-transition-in=".3">
      <video id="b-video" data-canonical-scene="b" data-start="0" data-duration="2" src="blue.mp4" data-has-audio="false"></video>
    </div>
  </div></body></html>`);
  lowerVisualTransitions(document as unknown as Document);
  assignMediaRenderIds(document as unknown as Document);
  const media = collectRenderMedia(document.toString());
  expect(media.audios).toHaveLength(1);
  expect(media.audios[0]).toMatchObject({ start: 0, end: 1, mediaStart: 0.5 });
  expect(media.videos).toHaveLength(4);
  expect(
    media.videos
      .filter((video) => video.freezeAt == null)
      .map((video) => [video.start, video.end, video.mediaStart]),
  ).toEqual([
    [0, 1, 0.5],
    [1, 2, 0.5],
  ]);
  const frozen = media.videos.filter((video) => video.freezeAt != null);
  expect(frozen[0]!.start).toBeCloseTo(0.85);
  expect(frozen[0]!.end).toBeCloseTo(1);
  expect(frozen[0]!.freezeAt).toBe(0.5);
  expect(frozen[1]!.start).toBeCloseTo(1);
  expect(frozen[1]!.end).toBeCloseTo(1.15);
  expect(frozen[1]!.freezeAt).toBeCloseTo(1.5 - 0.000001, 8);
});
