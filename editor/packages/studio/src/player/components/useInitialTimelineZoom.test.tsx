// @vitest-environment happy-dom
import React, { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { getTimelineFitPps } from "./timelineLayout";
import { getTimelinePixelsPerSecond } from "./timelineZoom";
import { getInitialMobileTimelineZoom, useInitialTimelineZoom } from "./useInitialTimelineZoom";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("initial source-scene editing zoom", () => {
  it("makes a four-second cut readable on a phone with a 46-second project", () => {
    const fit = getTimelineFitPps(390, 46, 80);
    const percent = getInitialMobileTimelineZoom(390, 80, fit);
    expect(percent).not.toBeNull();
    const pps = getTimelinePixelsPerSecond(fit, "manual", percent!);
    expect(4 * pps).toBeGreaterThan(150);
    expect((390 - 80 - 2) / pps).toBeCloseTo(8, 1);
    expect(getTimelinePixelsPerSecond(fit, "fit", percent!)).toBe(fit);
  });

  it("preserves desktop and short-project fit and ignores unmeasured layouts", () => {
    expect(getInitialMobileTimelineZoom(1200, 80, getTimelineFitPps(1200, 46, 80))).toBeNull();
    expect(getInitialMobileTimelineZoom(390, 80, getTimelineFitPps(390, 2, 80))).toBeNull();
    expect(getInitialMobileTimelineZoom(0, 80, 100)).toBeNull();
  });

  it("initializes once after hydration without overriding explicit Fit or later manual zoom", () => {
    usePlayerStore.setState({
      timelineReady: false,
      timelineSessionEpoch: 300,
      zoomMode: "fit",
      manualZoomPercent: 100,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const scrollRef = { current: document.createElement("div") };
    const lastScrollLeftRef = { current: 0 };
    function Harness({ duration = 46 }: { duration?: number }) {
      const mode = usePlayerStore((state) => state.zoomMode);
      useInitialTimelineZoom({
        viewportWidth: 390,
        contentOrigin: 80,
        fitPps: getTimelineFitPps(390, duration, 80),
        hasSourceScenes: true,
        scrollRef,
        lastScrollLeftRef,
      });
      // The real playhead hook anchors the viewport center in a layout effect
      // when manual zoom commits. Initialization must reset AFTER that effect.
      useLayoutEffect(() => {
        if (mode === "manual") {
          scrollRef.current.scrollLeft = 600;
          lastScrollLeftRef.current = 600;
        }
      }, [mode]);
      return null;
    }
    try {
      act(() => root.render(<Harness />));
      expect(usePlayerStore.getState().zoomMode).toBe("fit");
      act(() => usePlayerStore.setState({ timelineReady: true }));
      expect(usePlayerStore.getState().zoomMode).toBe("manual");
      expect(usePlayerStore.getState().manualZoomPercent).toBeGreaterThan(600);
      expect(scrollRef.current.scrollLeft).toBe(0);
      expect(lastScrollLeftRef.current).toBe(0);
      act(() => usePlayerStore.getState().setZoomMode("fit"));
      act(() => root.render(<Harness duration={48} />));
      expect(usePlayerStore.getState().zoomMode).toBe("fit");
      act(() =>
        usePlayerStore.setState({
          zoomMode: "manual",
          manualZoomPercent: 1200,
          timelineSessionEpoch: 301,
        }),
      );
      expect(usePlayerStore.getState().manualZoomPercent).toBe(1200);
    } finally {
      act(() => root.unmount());
    }
  });
});
