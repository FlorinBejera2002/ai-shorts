import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/playerStore";
import { clampTimelineZoomPercent } from "./timelineZoom";

/** Start phone edits with readable cuts; Fit remains the full-project overview. */
export function getInitialMobileTimelineZoom(
  viewportWidth: number,
  contentOrigin: number,
  fitPps: number,
): number | null {
  if (
    viewportWidth >= 640 ||
    viewportWidth <= contentOrigin ||
    !Number.isFinite(fitPps) ||
    fitPps <= 0
  ) {
    return null;
  }
  const editPps = Math.max(32, (viewportWidth - contentOrigin - 2) / 8);
  return editPps > fitPps ? clampTimelineZoomPercent((editPps / fitPps) * 100, fitPps) : null;
}

export function useInitialTimelineZoom({
  viewportWidth,
  contentOrigin,
  fitPps,
  hasSourceScenes,
  scrollRef,
  lastScrollLeftRef,
}: {
  viewportWidth: number;
  contentOrigin: number;
  fitPps: number;
  hasSourceScenes: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  lastScrollLeftRef: React.RefObject<number>;
}) {
  const sessionEpoch = usePlayerStore((state) => state.timelineSessionEpoch);
  const ready = usePlayerStore((state) => state.timelineReady);
  const initializedSession = useRef<number | null>(null);
  const pendingStart = useRef<{ session: number; percent: number } | null>(null);
  const zoomMode = usePlayerStore((state) => state.zoomMode);
  const manualZoomPercent = usePlayerStore((state) => state.manualZoomPercent);

  useEffect(() => {
    if (
      !ready ||
      !hasSourceScenes ||
      viewportWidth <= contentOrigin ||
      initializedSession.current === sessionEpoch
    )
      return;
    initializedSession.current = sessionEpoch;
    const state = usePlayerStore.getState();
    if (state.zoomMode !== "fit") return;
    const percent = getInitialMobileTimelineZoom(viewportWidth, contentOrigin, fitPps);
    if (percent === null) return;
    pendingStart.current = { session: sessionEpoch, percent };
    usePlayerStore.setState({ zoomMode: "manual", manualZoomPercent: percent });
  }, [contentOrigin, fitPps, hasSourceScenes, ready, scrollRef, sessionEpoch, viewportWidth]);

  useEffect(() => {
    const pending = pendingStart.current;
    if (
      !pending ||
      pending.session !== sessionEpoch ||
      zoomMode !== "manual" ||
      manualZoomPercent !== pending.percent
    )
      return;
    // Wait for the NEW zoom render, after its center-anchor layout effect.
    // Clear the saved offset too, or geometry restoration reopens the middle.
    pendingStart.current = null;
    lastScrollLeftRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [lastScrollLeftRef, manualZoomPercent, scrollRef, sessionEpoch, zoomMode]);
}
