import { describe, expect, it } from "vitest";
import { isSnapBarSticky, snapBarStyle } from "./snapBarLayout";
import {
  PHONE_GRID_RESERVE,
  PHONE_GRID_TOP,
  PHONE_SYNC_RESERVE,
  phoneStageReserve,
} from "../nle/preview/phoneStageReserve";

const idle = {
  gridPopoverOpen: false,
  gridVisible: false,
  recording: false,
  motionPathArmed: false,
};

describe("snap bar layout", () => {
  it("does not pin the desktop bar over the stage for a selection alone (St-Preview-Resize)", () => {
    expect(isSnapBarSticky(idle)).toBe(false);
  });

  it.each(["gridPopoverOpen", "gridVisible", "recording", "motionPathArmed"] as const)(
    "pins the bar while %s",
    (key) => {
      expect(isSnapBarSticky({ ...idle, [key]: true })).toBe(true);
    },
  );

  it("places the phone bar inside the space reserved above the stage", () => {
    expect(snapBarStyle(true)).toEqual({ top: PHONE_GRID_TOP });
    expect(PHONE_GRID_RESERVE + PHONE_GRID_TOP).toBeGreaterThanOrEqual(6);
  });
});

describe("phone stage reservation", () => {
  it("reserves nothing when no chrome needs the space", () => {
    expect(phoneStageReserve({ syncErrorShown: false, gridOpen: false })).toBe(0);
  });

  it("reserves the sync error card first, then the grid bar", () => {
    expect(phoneStageReserve({ syncErrorShown: true, gridOpen: true })).toBe(PHONE_SYNC_RESERVE);
    expect(phoneStageReserve({ syncErrorShown: false, gridOpen: true })).toBe(PHONE_GRID_RESERVE);
  });
});
