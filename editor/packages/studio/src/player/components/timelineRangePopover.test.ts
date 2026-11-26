import { describe, expect, it } from "vitest";
import { RANGE_POPOVER_GAP, getRangePopoverPosition } from "./timelineRangePopover";

describe("getRangePopoverPosition (St-Timeline-Range)", () => {
  const base = { popoverWidth: 420, popoverHeight: 400, viewportWidth: 1440, anchorTop: 640 };

  it("centres on the selected range and ends above the timeline card", () => {
    const { left, top } = getRangePopoverPosition({ ...base, rangeLeft: 428, rangeRight: 822 });
    expect(left + 210).toBe(625);
    expect(top + base.popoverHeight).toBe(640 - RANGE_POPOVER_GAP);
  });

  it("clamps to the window edges", () => {
    expect(getRangePopoverPosition({ ...base, rangeLeft: 0, rangeRight: 40 }).left).toBe(
      RANGE_POPOVER_GAP,
    );
    expect(getRangePopoverPosition({ ...base, rangeLeft: 1400, rangeRight: 1440 }).left).toBe(
      1440 - 420 - RANGE_POPOVER_GAP,
    );
    expect(
      getRangePopoverPosition({ ...base, anchorTop: 100, rangeLeft: 0, rangeRight: 1 }).top,
    ).toBe(RANGE_POPOVER_GAP);
  });
});
