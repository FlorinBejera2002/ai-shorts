import { describe, expect, it } from "vitest";
import { offCanvasSide } from "./OffCanvasIndicators";

const comp = { left: 100, top: 50, width: 200, height: 400 };

describe("offCanvasSide", () => {
  it("names the frame edge an element sits beyond", () => {
    expect(offCanvasSide({ left: 150, top: 0, width: 40, height: 20 }, comp)).toBe("top");
    expect(offCanvasSide({ left: 150, top: 460, width: 40, height: 20 }, comp)).toBe("bottom");
    expect(offCanvasSide({ left: 10, top: 100, width: 40, height: 20 }, comp)).toBe("left");
    expect(offCanvasSide({ left: 310, top: 100, width: 40, height: 20 }, comp)).toBe("right");
  });

  it("returns null when the element overlaps the frame", () => {
    expect(offCanvasSide({ left: 280, top: 100, width: 60, height: 20 }, comp)).toBeNull();
  });
});
