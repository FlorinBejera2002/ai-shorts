import { memo } from "react";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { t, useLocale } from "../../i18n/translate";
import { TimelineMenuItem, TimelineMenuSurface } from "./TimelineMenu";
import { formatDecimalSeconds } from "./timelineDisplayTime";

interface TrackGapContextMenuProps {
  x: number;
  y: number;
  /** Width (seconds) of the gap under the pointer, or null when no clip exists to the right. */
  gapWidth: number | null;
  /** "Close gap" actionable: a gap exists AND every clip that must shift is movable. */
  canCloseGap: boolean;
  /** "Close all gaps" actionable: the lane has gaps AND every shifting clip is movable. */
  canCloseAllGaps: boolean;
  /** The lane has at least one gap (distinguishes the two disabled reasons). */
  hasAnyGaps: boolean;
  onClose: () => void;
  onCloseGap: () => void;
  onCloseAllGaps: () => void;
  /** Hover state for the gap-strip highlight overlay (null = nothing hovered).
   *  Only reported for ACTIONABLE rows — a disabled row closes nothing, so
   *  highlighting from it would promise an action that can't happen. */
  onHoverAction: (action: "close-gap" | "close-all" | null) => void;
}

/**
 * Context menu for right-clicking EMPTY space on a timeline lane (St-Timeline-Gaps).
 * "Close gap" collapses the clicked gap by shifting the following clips left; "Close all
 * gaps" compacts the whole lane from 0. Both rows are ALWAYS present: an inapplicable action
 * dims with a tooltip saying why. Hovering an actionable row highlights the gap strip(s) it
 * would close (via onHoverAction → TimelineCanvas overlay).
 */
export const TrackGapContextMenu = memo(function TrackGapContextMenu({
  x,
  y,
  gapWidth,
  canCloseGap,
  canCloseAllGaps,
  hasAnyGaps,
  onClose,
  onCloseGap,
  onCloseAllGaps,
  onHoverAction,
}: TrackGapContextMenuProps) {
  useLocale();
  const menuRef = useContextMenuDismiss(onClose);

  // Disabled reasons: no gap under the pointer beats the lock reason — a
  // pointer not on a gap has nothing to close regardless of movability.
  const closeGapTitle = canCloseGap
    ? undefined
    : gapWidth == null
      ? t("timeline.noGapHere")
      : t("timeline.clipLocked");
  const closeAllTitle = canCloseAllGaps
    ? undefined
    : hasAnyGaps
      ? t("timeline.clipLocked")
      : t("timeline.noGaps");

  return (
    <TimelineMenuSurface
      ref={menuRef}
      role="group"
      label={t("timeline.gapActions")}
      x={x}
      y={y}
      width={250}
      estimatedHeight={88}
      onDismiss={onClose}
      onPointerLeave={() => onHoverAction(null)}
    >
      <TimelineMenuItem
        role="button"
        icon="arrow"
        disabled={!canCloseGap}
        title={closeGapTitle}
        hint={
          gapWidth != null
            ? t("timeline.seconds", { time: formatDecimalSeconds(gapWidth) })
            : undefined
        }
        onPointerEnter={() => onHoverAction(canCloseGap ? "close-gap" : null)}
        onClick={() => {
          if (!canCloseGap) return;
          onCloseGap();
          onClose();
        }}
      >
        {t("timeline.closeGap")}
      </TimelineMenuItem>
      <TimelineMenuItem
        role="button"
        icon="arrow"
        disabled={!canCloseAllGaps}
        title={closeAllTitle}
        onPointerEnter={() => onHoverAction(canCloseAllGaps ? "close-all" : null)}
        onClick={() => {
          if (!canCloseAllGaps) return;
          onCloseAllGaps();
          onClose();
        }}
      >
        {t("timeline.closeAllGaps")}
      </TimelineMenuItem>
    </TimelineMenuSurface>
  );
});
