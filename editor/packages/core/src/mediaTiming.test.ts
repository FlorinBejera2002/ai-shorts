import { describe, expect, it } from "vitest";
import { projectSourceWindow } from "./mediaTiming";

describe("source-window projection", () => {
  const input = {
    start: 0,
    duration: 60,
    mediaStart: 0,
    playbackRate: 1,
    hostStart: 4,
    hostDuration: 3,
    hostPlaybackStart: 12,
    hostPlaybackRate: 1,
  };

  it("keeps the selected source excerpt when a whole source is nested", () => {
    expect(projectSourceWindow(input)).toEqual({
      start: 4,
      duration: 3,
      mediaStart: 12,
      playbackRate: 1,
    });
  });

  it("advances source trim and multiplies rates when the host cuts into a child", () => {
    expect(
      projectSourceWindow({
        ...input,
        start: 10,
        mediaStart: 20,
        playbackRate: 0.5,
        hostPlaybackRate: 2,
      }),
    ).toEqual({ start: 4, duration: 3, mediaStart: 21, playbackRate: 1 });
  });

  it("preserves a child that starts later inside the source window", () => {
    expect(projectSourceWindow({ ...input, start: 13, duration: 1, mediaStart: 5 })).toEqual({
      start: 5,
      duration: 1,
      mediaStart: 5,
      playbackRate: 1,
    });
  });

  it("removes intervals on either side of the selected source window", () => {
    expect(projectSourceWindow({ ...input, duration: 2 }).duration).toBe(0);
    expect(projectSourceWindow({ ...input, start: 18 }).duration).toBe(0);
    expect(projectSourceWindow({ ...input, hostDuration: 0 }).duration).toBe(0);
  });

  it("bounds natural-length media and composes nested source clocks", () => {
    const inner = projectSourceWindow({ ...input, duration: Infinity });
    expect(
      projectSourceWindow({
        ...inner,
        hostStart: 20,
        hostDuration: 2,
        hostPlaybackStart: 5,
        hostPlaybackRate: 2,
      }),
    ).toEqual({ start: 20, duration: 1, mediaStart: 13, playbackRate: 2 });
  });
});
