import { describe, expect, it } from "vitest";
import { isSwipeBack } from "./useEdgeSwipeBack";

const at = (x: number, y: number, time: number) => ({ x, y, time });

describe("isSwipeBack", () => {
  it("commits a long rightward swipe", () => {
    expect(isSwipeBack(at(4, 300, 0), at(120, 310, 600))).toBe(true);
  });

  it("commits a short quick flick", () => {
    expect(isSwipeBack(at(4, 300, 0), at(60, 305, 80))).toBe(true);
  });

  it("ignores a short slow drag", () => {
    expect(isSwipeBack(at(4, 300, 0), at(60, 305, 400))).toBe(false);
  });

  it("ignores mostly vertical movement and leftward movement", () => {
    expect(isSwipeBack(at(4, 300, 0), at(110, 450, 300))).toBe(false);
    expect(isSwipeBack(at(20, 300, 0), at(2, 300, 100))).toBe(false);
  });
});
