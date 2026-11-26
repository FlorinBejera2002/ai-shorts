import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Timeline } from "../../player";
import type { TimelineElement } from "../../player";
import type { BlockedTimelineEditIntent } from "../../player/components/timelineEditing";
import { TimelineResizeDivider } from "./TimelineResizeDivider";
import { useTimelineEditContext } from "../../contexts/TimelineEditContext";
import { trackStudioExpandedClipEdit } from "../../telemetry/events";
import { useNLEContext } from "./NLEContext";
import type { TimelineMoveOperation } from "../../hooks/timelineMoveAdapter";
import { t, useLocale } from "../../i18n/translate";
import { TimelineIcon } from "../../player/components/TimelineIcon";
import { useIsPhone } from "../shell/useIsPhone";
import { TimelineShortcutsSheet } from "./TimelineToolbarShortcuts";
import { TimelineShortcutsContext } from "./TimelineToolbarShortcutsContext";

type TimelineMoveEdit = {
  element: TimelineElement;
  updates: Pick<TimelineElement, "start" | "track">;
};

export function forwardRebasedTimelineMoveElements(
  edits: TimelineMoveEdit[],
  coalesceKey: string | undefined,
  operation: TimelineMoveOperation | undefined,
  onMoveElements: (
    edits: TimelineMoveEdit[],
    coalesceKey?: string,
    operation?: TimelineMoveOperation,
    coalesceMs?: number,
  ) => Promise<void> | void,
  coalesceMs?: number,
) {
  return onMoveElements(
    edits.map(({ element, updates }) => {
      const basis = element.expandedParentStart;
      if (basis === undefined) return { element, updates };
      return {
        element: { ...element, id: element.domId ?? element.id, start: element.start - basis },
        updates: { ...updates, start: Math.max(0, updates.start - basis) },
      };
    }),
    coalesceKey,
    operation,
    coalesceMs,
  );
}

type TimelineResizeChange = {
  element: TimelineElement;
  start: number;
  duration: number;
  playbackStart?: number;
};

export function forwardRebasedTimelineResizeElements(
  changes: TimelineResizeChange[],
  options: { coalesceKey?: string } | undefined,
  onResizeElements: (
    changes: TimelineResizeChange[],
    options?: { coalesceKey?: string },
  ) => Promise<void> | void,
) {
  return onResizeElements(
    changes.map((change) => {
      const basis = change.element.expandedParentStart;
      if (basis === undefined) return change;
      return {
        ...change,
        element: {
          ...change.element,
          id: change.element.domId ?? change.element.id,
          start: change.element.start - basis,
        },
        start: Math.max(0, change.start - basis),
      };
    }),
    options,
  );
}

export interface TimelinePaneProps {
  /** Slot rendered above the timeline tracks (toolbar with split, delete, zoom) */
  timelineToolbar?: ReactNode;
  /** Slot rendered below the timeline tracks */
  timelineFooter?: ReactNode;
  /** Custom clip content renderer for timeline (thumbnails, waveforms, etc.) */
  renderClipContent?: (
    element: TimelineElement,
    style: { clip: string; label: string },
  ) => ReactNode;
  onFileDrop?: (
    files: File[],
    placement?: Pick<TimelineElement, "start" | "track">,
  ) => Promise<void> | void;
  onDeleteElement?: (element: TimelineElement) => Promise<void> | void;
  onAssetDrop?: (
    assetPath: string,
    placement: Pick<TimelineElement, "start" | "track">,
  ) => Promise<void> | void;
  onBlockDrop?: (
    blockName: string,
    placement: Pick<TimelineElement, "start" | "track">,
  ) => Promise<void> | void;
  onCompositionDrop?: (
    sourcePath: string,
    placement: Pick<TimelineElement, "start" | "track">,
  ) => Promise<void> | void;
  onBlockedEditAttempt?: (element: TimelineElement, intent: BlockedTimelineEditIntent) => void;
  onSelectTimelineElement?: (element: TimelineElement | null) => void;
}

// fallow-ignore-next-line complexity
export function TimelinePane({
  timelineToolbar,
  timelineFooter,
  renderClipContent,
  onFileDrop,
  onDeleteElement,
  onAssetDrop,
  onBlockDrop,
  onCompositionDrop,
  onBlockedEditAttempt,
  onSelectTimelineElement,
}: TimelinePaneProps) {
  const {
    seek,
    handleDrillDown,
    compositionStack,
    updateCompositionStack,
    timelineH,
    setTimelineH,
    persistTimelineH,
    containerRef,
    timelineDisabled,
    timelineSessionEpoch,
  } = useNLEContext();
  useLocale();
  const phone = useIsPhone();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const shortcutsControl = useMemo(
    () => ({ open: shortcutsOpen, toggle: () => setShortcutsOpen((open) => !open) }),
    [shortcutsOpen],
  );

  // Move/resize/split come from the timeline edit context, not props — the
  // wrappers below intercept expanded clips and must call the *real* handlers.
  // (Delete is a direct prop; it stays that way.)
  const { onMoveElement, onMoveElements, onResizeElement, onResizeElements, onSplitElement } =
    useTimelineEditContext();

  // An expanded sub-comp child reaches the normal edit handlers in its own
  // local coordinates: addressed by its real DOM id, with timeline time rebased
  // onto the sub-comp it lives in. The handlers then save + reloadPreview exactly
  // as they do for top-level clips — no separate live-DOM path.
  const toLocalElement = useCallback(
    (element: TimelineElement, basis: number): TimelineElement => ({
      ...element,
      id: element.domId ?? element.id,
      start: element.start - basis,
    }),
    [],
  );

  const handleMoveElement = useCallback(
    (element: TimelineElement, updates: Pick<TimelineElement, "start" | "track">) => {
      const basis = element.expandedParentStart;
      if (basis === undefined) return onMoveElement?.(element, updates);
      trackStudioExpandedClipEdit({ action: "move" });
      onMoveElement?.(toLocalElement(element, basis), {
        ...updates,
        start: Math.max(0, updates.start - basis),
      });
    },
    [onMoveElement, toLocalElement],
  );

  // Batched move (ripple / insert): rebase each expanded sub-comp child to its
  // local coords, exactly as handleMoveElement does for a single clip.
  const handleMoveElements = useCallback(
    (
      edits: Array<{ element: TimelineElement; updates: Pick<TimelineElement, "start" | "track"> }>,
      coalesceKey?: string,
      operation?: TimelineMoveOperation,
      coalesceMs?: number,
    ) => {
      // Match the sibling handlers: report the telemetry when the batch touches at
      // least one expanded sub-comp child (the clips being rebased to local coords).
      if (edits.some(({ element }) => element.expandedParentStart !== undefined)) {
        trackStudioExpandedClipEdit({ action: "move" });
      }
      if (!onMoveElements) return;
      return forwardRebasedTimelineMoveElements(
        edits,
        coalesceKey,
        operation,
        onMoveElements,
        coalesceMs,
      );
    },
    [onMoveElements],
  );

  const handleResizeElement = useCallback(
    (
      element: TimelineElement,
      updates: Pick<TimelineElement, "start" | "duration" | "playbackStart">,
    ) => {
      const basis = element.expandedParentStart;
      if (basis === undefined) return onResizeElement?.(element, updates);
      trackStudioExpandedClipEdit({ action: "resize" });
      onResizeElement?.(toLocalElement(element, basis), {
        ...updates,
        start: Math.max(0, updates.start - basis),
      });
    },
    [onResizeElement, toLocalElement],
  );

  const handleResizeElements = useCallback(
    (
      changes: Array<{
        element: TimelineElement;
        start: number;
        duration: number;
        playbackStart?: number;
      }>,
      options?: { coalesceKey?: string },
    ) => {
      if (!onResizeElements) return;
      if (changes.some(({ element }) => element.expandedParentStart !== undefined)) {
        trackStudioExpandedClipEdit({ action: "resize" });
      }
      return forwardRebasedTimelineResizeElements(changes, options, onResizeElements);
    },
    [onResizeElements],
  );

  const handleDeleteElement = useCallback(
    (element: TimelineElement) => {
      const basis = element.expandedParentStart;
      if (basis === undefined) return onDeleteElement?.(element);
      trackStudioExpandedClipEdit({ action: "delete" });
      return onDeleteElement?.(toLocalElement(element, basis));
    },
    [onDeleteElement, toLocalElement],
  );

  const handleSplitElement = useCallback(
    (element: TimelineElement, splitTime: number) => {
      const basis = element.expandedParentStart;
      if (basis === undefined) return onSplitElement?.(element, splitTime);
      trackStudioExpandedClipEdit({ action: "split" });
      return onSplitElement?.(toLocalElement(element, basis), Math.max(0, splitTime - basis));
    },
    [onSplitElement, toLocalElement],
  );

  return (
    <TimelineShortcutsContext.Provider value={shortcutsControl}>
      <TimelineResizeDivider
        timelineH={timelineH}
        setTimelineH={setTimelineH}
        persistTimelineH={persistTimelineH}
        containerRef={containerRef}
        disabled={timelineDisabled}
      />

      {/* Timeline card (St-Timeline-Tools): 24px card on the canvas, toolbar row then tracks.
          The 1px inset keeps the divider's height math exact. */}
      <div
        className="relative flex h-[min(var(--timeline-height),26dvh)] flex-col flex-shrink-0 px-px pb-px sm:h-[var(--timeline-height)]"
        style={{ "--timeline-height": `${timelineH}px` } as React.CSSProperties}
        aria-disabled={timelineDisabled || undefined}
      >
        <section
          aria-label={t("timeline.label")}
          data-timeline-card=""
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-card bg-studio-surface px-2.5 py-2 shadow-studio sm:px-3 sm:py-2.5"
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-clip]")) return;
            if (timelineDisabled) return;
            if (compositionStack.length > 1) {
              updateCompositionStack((prev) => prev.slice(0, -1));
            }
          }}
        >
          <div className="flex min-h-[34px] flex-shrink-0 items-center sm:min-h-9">
            {timelineToolbar}
          </div>
          <Timeline
            sessionEpoch={timelineSessionEpoch}
            onSeek={seek}
            onDrillDown={handleDrillDown}
            renderClipContent={renderClipContent}
            onFileDrop={onFileDrop}
            onDeleteElement={handleDeleteElement}
            onAssetDrop={onAssetDrop}
            onBlockDrop={onBlockDrop}
            onCompositionDrop={onCompositionDrop}
            onMoveElement={handleMoveElement}
            onMoveElements={handleMoveElements}
            onResizeElement={handleResizeElement}
            onResizeElements={handleResizeElements}
            onBlockedEditAttempt={onBlockedEditAttempt}
            onSplitElement={handleSplitElement}
            onSelectElement={onSelectTimelineElement}
          />
        </section>
        {timelineFooter && <div className="flex-shrink-0">{timelineFooter}</div>}
        {timelineDisabled && <TimelineLoadingOverlay />}
      </div>
      <TimelineShortcutsSheet
        open={shortcutsOpen}
        phone={phone}
        onClose={closeShortcuts}
        onSeek={seek}
      />
    </TimelineShortcutsContext.Provider>
  );
}

/** Blocks edits while a composition loads (St-Timeline-Loading): the lanes dim under a pill. */
function TimelineLoadingOverlay() {
  return (
    <div
      className="absolute inset-0 z-30 flex cursor-not-allowed items-center justify-center rounded-card bg-[color-mix(in_srgb,var(--st-sf)_45%,transparent)]"
      data-testid="timeline-loading-disabled-overlay"
      role="status"
      onPointerDown={(event) => event.preventDefault()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-studio-surface px-4 text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)]">
        <TimelineIcon name="refresh" size={16} className="animate-spin" />
        {t("timeline.loading")}
      </span>
    </div>
  );
}
