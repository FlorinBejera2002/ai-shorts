import { describe, expect, it } from "vitest";
import { parseVideoElements, resolveVideoExtractionWindow } from "./videoFrameExtractor.js";
import type { VideoMetadata } from "../utils/ffprobe.js";
import { parseAudioElements } from "./audioMixer.js";

const metadata: VideoMetadata = {
  durationSeconds: 2,
  videoStreamDurationSeconds: 2,
  width: 320,
  height: 180,
  fps: 30,
  videoCodec: "h264",
  hasAudio: true,
  isVFR: false,
  hasAlpha: false,
  colorSpace: null,
};

describe("frozen transition picture extraction", () => {
  it("never mixes source audio from a frozen picture", () => {
    expect(
      parseAudioElements(
        '<video id="frozen" src="clip.mp4" data-start="0" data-duration="1" data-freeze-at="0.5" data-has-audio="true"></video>',
      ),
    ).toEqual([]);
  });
  const parse = (freeze: string, start = "1") =>
    parseVideoElements(
      `<video id="overlay" src="clip.mp4" data-start="${start}" data-duration="0.15"
        data-freeze-at="${freeze}" data-has-audio="true" loop></video>`,
    )[0]!;

  it("silences a frozen picture and extracts one frame without shortening its slot", () => {
    const video = parse("0.999999");
    expect(video).toMatchObject({ freezeAt: 0.999999, loop: false, hasAudio: false, end: 1.15 });
    expect(resolveVideoExtractionWindow(video, metadata, 2)).toEqual({
      compositionStart: 1,
      mediaStart: 0.999999,
      durationSeconds: 0.000001,
      preserveTimelineEnd: true,
      finalFrameOnly: true,
    });
  });

  it("clamps beyond-EOF freeze to the held final frame", () => {
    expect(resolveVideoExtractionWindow(parse("3"), metadata, 2).mediaStart).toBe(2);
  });

  it("skips a frozen picture outside the render timeline", () => {
    expect(resolveVideoExtractionWindow(parse("0.5", "3"), metadata, 2).durationSeconds).toBe(0);
  });

  it.each(["", "-1", "1s", "NaN"])("ignores invalid frozen time %j", (value) => {
    expect(parse(value)).toMatchObject({ loop: true, hasAudio: true });
    expect(parse(value)).not.toHaveProperty("freezeAt");
  });
});
