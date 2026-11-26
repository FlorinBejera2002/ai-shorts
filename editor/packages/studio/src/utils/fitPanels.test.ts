import { describe, expect, it } from "vitest";
import {
  MIN_PREVIEW_H,
  MIN_PREVIEW_W,
  MIN_TIMELINE_H,
  RAIL_W,
  SHELL_GAP,
  defaultPanelWidths,
  fitPanelWidths,
  fitTimelineHeight,
  shellChromeWidth,
} from "./fitPanels";

function fitAt(viewportWidth: number) {
  return fitPanelWidths(viewportWidth, defaultPanelWidths(viewportWidth));
}

describe("defaultPanelWidths", () => {
  // Frozen literals from the St-Main board (312 / 340 at 1440), scaled down on smaller windows.
  it.each([
    [1680, 312, 340],
    [1440, 312, 340],
    [1280, 277, 302],
    [900, 200, 280],
  ])("gives %ipx the board defaults", (vw, left, right) => {
    expect(defaultPanelWidths(vw)).toEqual({ left, right });
  });
});

describe("shellChromeWidth", () => {
  it("adds up to the St-Main board at 1440: 312 + 656 + 340 + chrome", () => {
    expect(shellChromeWidth(false, false)).toBe(1440 - 312 - 656 - 340);
  });

  it("spends less on a railed side panel and more on an inspector rail", () => {
    expect(shellChromeWidth(true, false)).toBe(SHELL_GAP * 3 + RAIL_W + SHELL_GAP);
    expect(shellChromeWidth(true, true)).toBe(SHELL_GAP * 4 + RAIL_W * 2);
  });
});

describe("fitPanelWidths", () => {
  it.each([1680, 1440, 1280])("leaves %ipx untouched by reconciliation", (vw) => {
    const preferred = defaultPanelWidths(vw);
    const fitted = fitPanelWidths(vw, preferred);
    expect(fitted.left).toBe(preferred.left);
    expect(fitted.right).toBe(preferred.right);
    expect(fitted.autoCollapseLeft).toBe(false);
    expect(fitted.autoCollapseRight).toBe(false);
  });

  it.each([1680, 1440, 1280, 1100, 972, 971, 860, 768, 767, 640])(
    "never starves the preview at %ipx",
    (vw) => {
      expect(fitAt(vw).preview).toBeGreaterThanOrEqual(MIN_PREVIEW_W);
    },
  );

  it("matches the board preview width at 1440", () => {
    expect(fitAt(1440)).toMatchObject({ left: 312, right: 340, preview: 656 });
    expect(fitAt(1280).preview).toBe(1280 - 277 - 302 - shellChromeWidth(false, false));
  });

  it("fits everything at its minimum at exactly 972, the derived threshold", () => {
    expect(fitAt(972)).toMatchObject({
      left: 200,
      right: 280,
      preview: MIN_PREVIEW_W,
      autoCollapseLeft: false,
    });
  });

  it("rails the side panel one pixel below the threshold", () => {
    expect(fitAt(972).autoCollapseLeft).toBe(false);
    expect(fitAt(971).autoCollapseLeft).toBe(true);
    expect(fitAt(971).left).toBe(0);
  });

  it("rails the inspector one pixel below its own threshold", () => {
    expect(fitAt(768).autoCollapseRight).toBe(false);
    expect(fitAt(768).right).toBeGreaterThan(0);
    expect(fitAt(767).autoCollapseRight).toBe(true);
    expect(fitAt(767).right).toBe(0);
    expect(fitAt(767).preview).toBe(767 - shellChromeWidth(true, true));
  });

  it("never drives an EXPANDED side panel below its usable minimum", () => {
    const fitted = fitPanelWidths(1000, { left: 600, right: 600 });
    expect(fitted.left).toBeGreaterThanOrEqual(200);
    expect(fitted.right).toBeGreaterThanOrEqual(280);
  });

  it("caps a single panel at 40% of the window", () => {
    expect(fitPanelWidths(1800, { left: 900, right: 280 }).left).toBe(720);
  });

  it("lets the preview floor win when the cap alone is not enough", () => {
    // 40% of 1100 is 440, but 440 + 280 + 132 leaves the preview at 248.
    const fitted = fitPanelWidths(1100, { left: 900, right: 280 });
    expect(fitted.left).toBe(1100 - MIN_PREVIEW_W - 280 - shellChromeWidth(false, false));
    expect(fitted.preview).toBe(MIN_PREVIEW_W);
  });

  it("survives a viewport narrower than the preview floor alone", () => {
    const fitted = fitAt(300);
    expect(fitted.preview).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(fitted.preview)).toBe(false);
    expect(fitted.left).toBe(0);
  });

  it("returns preferences untouched before the shell is measured", () => {
    const preferred = { left: 320, right: 400 };
    expect(fitPanelWidths(0, preferred)).toMatchObject({ ...preferred, preview: 0 });
    expect(fitPanelWidths(Number.NaN, preferred)).toMatchObject(preferred);
  });

  it("is idempotent, so a resize loop cannot oscillate", () => {
    for (const vw of [1512, 1100, 972, 860, 760, 560]) {
      const once = fitPanelWidths(vw, defaultPanelWidths(vw));
      const twice = fitPanelWidths(vw, once);
      expect(twice).toEqual(once);
    }
  });
});

describe("fitTimelineHeight", () => {
  it("keeps a height that fits", () => {
    expect(fitTimelineHeight(717, 429)).toBe(429);
  });

  it("reclaims height for the preview when the shell shrinks", () => {
    // The measured bug: mounted at 760 tall, dragged to 520. Preview was 47px.
    expect(fitTimelineHeight(477, 429)).toBe(477 - MIN_PREVIEW_H);
    expect(477 - fitTimelineHeight(477, 429)).toBeGreaterThanOrEqual(MIN_PREVIEW_H);
  });

  it("raises a too-small preference to the timeline minimum", () => {
    expect(fitTimelineHeight(717, 10)).toBe(MIN_TIMELINE_H);
  });

  it("keeps the timeline usable when the shell is shorter than both minimums", () => {
    expect(fitTimelineHeight(120, 429)).toBe(MIN_TIMELINE_H);
  });

  it("returns the preference before the shell is measured", () => {
    expect(fitTimelineHeight(0, 429)).toBe(429);
  });

  it("is idempotent", () => {
    const once = fitTimelineHeight(477, 429);
    expect(fitTimelineHeight(477, once)).toBe(once);
  });

  it("would return the preferred height if callers kept one", () => {
    // The helper is preference-preserving; the vertical CALLER still stores the
    // clamped value, so a shrink-then-grow does not restore the old height the
    // way panel widths do. Tracked as a known asymmetry, not fixed here.
    const preferred = 429;
    expect(fitTimelineHeight(477, preferred)).toBe(277);
    expect(fitTimelineHeight(717, preferred)).toBe(429);
  });
});
