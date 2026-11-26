import { describe, expect, it } from "vitest";
import {
  formatPointTime,
  formatRate,
  formatTransportReadout,
  formatTransportTime,
  stepTransportFrame,
} from "./transportFormat";

describe("transport readouts", () => {
  it("formats M:SS without a padded minute", () => {
    expect(formatTransportTime(8.4)).toBe("0:08");
    expect(formatTransportTime(45)).toBe("0:45");
    expect(formatTransportTime(125)).toBe("2:05");
    expect(formatTransportTime(Number.NaN)).toBe("0:00");
  });

  it("formats work-area points with hundredths", () => {
    expect(formatPointTime(2.4)).toBe("0:02.40");
    expect(formatPointTime(41.1)).toBe("0:41.10");
  });

  it("switches between time and frame readouts", () => {
    expect(formatTransportReadout(8, 45, "time")).toBe("0:08 / 0:45");
    expect(formatTransportReadout(8, 45, "frame")).toBe("240f / 1350f");
  });

  it("uses the Romanian decimal comma for rates", () => {
    expect(formatRate(0.25, "ro")).toBe("0,25×");
    expect(formatRate(1.5, "en")).toBe("1.5×");
    expect(formatRate(1, "ro")).toBe("1×");
  });

  it("steps one frame and clamps to the duration", () => {
    expect(stepTransportFrame(1, 1, 10)).toBeCloseTo(31 / 30);
    expect(stepTransportFrame(0, -1, 10)).toBe(0);
    expect(stepTransportFrame(10, 1, 10)).toBe(10);
  });
});
