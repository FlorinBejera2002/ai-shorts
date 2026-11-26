import { useCallback, useEffect, useRef } from "react";
import { t, useLocale } from "../../i18n/translate";
import { readStudioUiPreferences } from "../../utils/studioUiPreferences";
import { DEFAULT_TIMELINE_H } from "./NLEContext";
import { MIN_PREVIEW_H, MIN_TIMELINE_H, fitTimelineHeight } from "../../utils/fitPanels";

/**
 * Horizontal drag/keyboard-resizable divider between the preview and the
 * timeline. Implements the separator pattern: ArrowUp grows the timeline,
 * ArrowDown shrinks it (mirrors the drag direction).
 */
export function TimelineResizeDivider({
  timelineH,
  setTimelineH,
  persistTimelineH,
  containerRef,
  disabled,
}: {
  timelineH: number;
  setTimelineH: React.Dispatch<React.SetStateAction<number>>;
  persistTimelineH: (h: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  disabled: boolean;
}) {
  useLocale();
  const isDragging = useRef(false);
  const timelineHRef = useRef(timelineH);
  timelineHRef.current = timelineH;
  // Mounted after the body may already have clamped `timelineH`, so the preference
  // starts from what the user stored (or the board default), not from the current value.
  const preferredHRef = useRef(readStudioUiPreferences().timelineHeight ?? DEFAULT_TIMELINE_H);
  const persistPreferred = useCallback(
    (height: number) => {
      preferredHRef.current = height;
      persistTimelineH(height);
    },
    [persistTimelineH],
  );
  useRestorePreferredHeight(containerRef, preferredHRef, setTimelineH);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      isDragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [disabled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      setTimelineH(fitTimelineHeight(rect.height, rect.height - mouseY));
    },
    [disabled, containerRef, setTimelineH],
  );

  const handlePointerUp = useCallback(() => {
    if (isDragging.current) persistPreferred(timelineHRef.current);
    isDragging.current = false;
  }, [persistPreferred]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const containerH = containerRef.current?.getBoundingClientRect().height ?? 0;
      const delta = e.key === "ArrowUp" ? 16 : -16;
      setTimelineH((prev) => {
        const next = fitTimelineHeight(containerH, prev + delta);
        persistPreferred(next);
        return next;
      });
    },
    [disabled, containerRef, setTimelineH, persistPreferred],
  );

  return (
    // The 12px gap between the preview and the timeline card is the handle (St-Timeline-Resize):
    // a 3px seam in the layout, with the band, outline and grip drawn over the whole gap.
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={t("timeline.resize")}
      aria-valuenow={Math.round(timelineH)}
      aria-valuemin={MIN_TIMELINE_H}
      aria-valuemax={Math.round(
        (containerRef.current?.getBoundingClientRect().height ?? 600) - MIN_PREVIEW_H,
      )}
      tabIndex={0}
      data-timeline-resize=""
      className="group relative z-10 h-[3px] flex-shrink-0 cursor-row-resize outline-none"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -top-[9px] flex h-3 items-center justify-center rounded-full outline-offset-[-2px] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-[var(--st-tx)] group-active:outline group-active:outline-2 group-active:outline-[var(--st-tx)]"
      >
        <span className="h-1 w-10 rounded-full bg-transparent transition-colors group-hover:bg-[var(--st-hd)] group-focus-visible:bg-[var(--st-tx)] group-active:bg-[var(--st-tx)]" />
      </div>
    </div>
  );
}

/**
 * A window (or a loading state) that is briefly too short clamps the timeline, and the
 * clamp alone never gives the height back. Fit the user's preferred height (the stored or
 * default one, or the last one they dragged to) whenever the body resizes, so a transient
 * squeeze on load does not leave the card at 220px instead of the board's 260.
 */
function useRestorePreferredHeight(
  containerRef: React.RefObject<HTMLDivElement | null>,
  preferredHRef: React.RefObject<number>,
  setTimelineH: React.Dispatch<React.SetStateAction<number>>,
) {
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const containerH = element.getBoundingClientRect().height;
      if (containerH) setTimelineH(fitTimelineHeight(containerH, preferredHRef.current));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, preferredHRef, setTimelineH]);
}
