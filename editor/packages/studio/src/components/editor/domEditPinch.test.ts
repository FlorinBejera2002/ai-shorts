import { describe, expect, it } from "vitest";
import { pinchGeometry, resolvePinchDraft } from "./domEditPinch";
import type { GestureState } from "./domEditOverlayGestures";

describe("two-finger geometry", () => {
  it("scales from finger separation and follows the centroid independently", () => {
    const gesture = {
      actualWidth: 300,
      actualHeight: 60,
      originLeft: 20,
      originTop: 40,
      originWidth: 150,
      originHeight: 30,
      touchPoints: new Map([
        [1, { x: 60, y: 80 }],
        [2, { x: 260, y: 80 }],
      ]),
      pinch: { distance: 100, centerX: 140, centerY: 70, offsetX: 4, offsetY: 6, changed: false },
    } as GestureState;
    expect(resolvePinchDraft(gesture)).toEqual({ width: 600, height: 120 });
    expect(gesture.resizeFixedCenterStart).toEqual({ x: 119, y: 71 });
    expect(gesture.pinch?.changed).toBe(true);
  });
  it("measures separation consistently for diagonal/rotated finger placement", () => {
    expect(
      pinchGeometry([
        { x: 10, y: 20 },
        { x: 70, y: 100 },
      ]),
    ).toEqual({ distance: 100, centerX: 40, centerY: 60 });
    expect(pinchGeometry([{ x: 0, y: 0 }])).toBeNull();
  });
});
