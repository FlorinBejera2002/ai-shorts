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

  it("prepares the held picture before its first visible transition", () => {
    const video = document.createElement("video");
    video.dataset.start = "2";
    video.dataset.duration = "0.3";
    video.dataset.freezeAt = "1.499999";
    Object.defineProperty(video, "duration", { value: 3 });
    document.body.append(video);
    const { mediaClips } = refreshRuntimeMediaCache();
    syncRuntimeMedia({ clips: mediaClips, timeSeconds: 0, playing: false, playbackRate: 1 });
    expect(video.currentTime).toBe(1.499999);
    expect(video.muted).toBe(true);
    expect(video.preload).toBe("auto");
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
