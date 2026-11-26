import { describe, expect, it } from "vitest";
import { formatClipDuration, renderMetaParts } from "./renderScale";

const PORTRAIT = { width: 1080, height: 1920 };

describe("formatClipDuration", () => {
  it("prints m:ss like the export boards", () => {
    expect(formatClipDuration(8)).toBe("0:08");
    expect(formatClipDuration(65.4)).toBe("1:05");
    expect(formatClipDuration(750)).toBe("12:30");
  });

  it("is null for an unknown length", () => {
    expect(formatClipDuration(0)).toBeNull();
    expect(formatClipDuration(Number.NaN)).toBeNull();
    expect(formatClipDuration(undefined)).toBeNull();
  });
});

describe("renderMetaParts", () => {
  it("leads with the clip length, then size and frame rate (St-Exported)", () => {
    expect(renderMetaParts({ resolution: "auto", fps: 30 }, PORTRAIT, 8)).toEqual([
      "0:08",
      "1080p",
      "30 fps",
    ]);
  });

  it("treats a job without a recorded size as Auto, so the size part is not lost", () => {
    expect(renderMetaParts({ fps: 30 }, PORTRAIT)).toEqual(["1080p", "30 fps"]);
  });

  it("uses the chosen preset over the composition size", () => {
    expect(renderMetaParts({ resolution: "landscape-4k", fps: 60 }, PORTRAIT)).toEqual([
      "4K",
      "60 fps",
    ]);
  });
});
