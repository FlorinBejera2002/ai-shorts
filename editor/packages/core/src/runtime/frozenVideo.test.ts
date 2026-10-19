import { afterEach, describe, expect, it, vi } from "vitest";
import { readVideoFreezeTime } from "./frozenVideo.js";
import { refreshRuntimeMediaCache, syncRuntimeMedia } from "./media.js";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("picture-only frozen video", () => {
  it.each(["", "-1", "Infinity", "NaN", "1s"])(
    "rejects malformed source time %j and leaves ordinary video unchanged",
    (value) => {
      const video = document.createElement("video");
      video.setAttribute("data-freeze-at", value);
      expect(readVideoFreezeTime(video)).toBeNull();
    },
  );

  it("does not freeze audio", () => {
    const audio = document.createElement("audio");
    audio.setAttribute("data-freeze-at", "1");
    expect(readVideoFreezeTime(audio)).toBeNull();
  });

  it.each([0.5, 1, 2])(
    "prepares held pictures only within one second at rate %s",
    (playbackRate) => {
      const video = document.createElement("video");
      video.dataset.start = "2";
      video.dataset.duration = "0.3";
      video.dataset.freezeAt = "1.499999";
      video.preload = "none";
      Object.defineProperty(video, "duration", { value: 3 });
      document.body.append(video);
      const { mediaClips } = refreshRuntimeMediaCache();
      const seek = vi.spyOn(video, "currentTime", "set");
      syncRuntimeMedia({
        clips: mediaClips,
        timeSeconds: 2 - playbackRate - 0.01,
        playing: false,
        playbackRate,
      });
      expect(seek).not.toHaveBeenCalled();
      expect(video.preload).toBe("none");
      syncRuntimeMedia({
        clips: mediaClips,
        timeSeconds: 2 - playbackRate,
        playing: false,
        playbackRate,
      });
      expect(video.currentTime).toBe(1.499999);
      expect(video.muted).toBe(true);
      expect(video.preload).toBe("auto");
      expect(seek).toHaveBeenCalledExactlyOnceWith(1.499999);
      // Leaving the window must not reset an unrelated decoder on later ticks.
      video.currentTime = 0;
      seek.mockClear();
      syncRuntimeMedia({ clips: mediaClips, timeSeconds: 3, playing: true, playbackRate });
      expect(seek).not.toHaveBeenCalled();
    },
  );

  it("seeks a cold held picture when scrubbing directly into its visible window", () => {
    const video = document.createElement("video");
    video.dataset.start = "12";
    video.dataset.duration = "0.15";
    video.dataset.freezeAt = "3.999999";
    video.preload = "none";
    Object.defineProperty(video, "duration", { value: 10 });
    document.body.append(video);
    const { mediaClips } = refreshRuntimeMediaCache();
    syncRuntimeMedia({ clips: mediaClips, timeSeconds: 12.05, playing: false, playbackRate: 1 });
    expect(video.currentTime).toBe(3.999999);
    expect(video.preload).toBe("auto");
    expect(video.paused).toBe(true);
    expect(video.muted).toBe(true);
  });

  it("holds the selected frame while the transport plays and scrubs both ways", () => {
    const video = document.createElement("video");
    video.dataset.start = "2";
    video.dataset.duration = "0.3";
    video.dataset.freezeAt = "0.999999";
    video.loop = true;
    Object.defineProperty(video, "duration", { value: 3 });
    Object.defineProperty(video, "paused", { value: false, configurable: true });
    const play = vi.spyOn(video, "play").mockResolvedValue();
    const pause = vi.spyOn(video, "pause").mockImplementation(() => {
      Object.defineProperty(video, "paused", { value: true, configurable: true });
    });
    document.body.append(video);
    const { mediaClips } = refreshRuntimeMediaCache();
    const onElementVolume = vi.fn();
    expect(mediaClips[0]).toMatchObject({ start: 2, end: 2.3, loop: false, freezeAt: 0.999999 });
    for (const timeSeconds of [2, 2.2, 2.05]) {
      syncRuntimeMedia({
        clips: mediaClips,
        timeSeconds,
        playing: true,
        playbackRate: 1,
        onElementVolume,
      });
      expect(video.currentTime).toBe(0.999999);
      expect(video.muted).toBe(true);
      expect(video.volume).toBe(0);
    }
    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalledOnce();
    expect(onElementVolume).toHaveBeenLastCalledWith(video, 0, 0);
  });
});
