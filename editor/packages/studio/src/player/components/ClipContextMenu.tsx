import { memo } from "react";
import type { TimelineElement } from "../store/playerStore";
import { canSplitElement } from "../../utils/timelineElementSplit";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { t, useLocale } from "../../i18n/translate";
import { useMenuKeyboardNav } from "./menuKeyboardNav";
import { TimelineMenuItem, TimelineMenuSurface } from "./TimelineMenu";
import { formatDecimalSeconds } from "./timelineDisplayTime";

interface ClipContextMenuProps {
  x: number;
  y: number;
  element: TimelineElement;
  currentTime: number;
  onClose: () => void;
  onSplit: (element: TimelineElement, splitTime: number) => void;
  onDelete: (element: TimelineElement) => void;
}

/** Clip actions (St-Timeline-ClipMenu): split at the playhead, delete. */
export const ClipContextMenu = memo(function ClipContextMenu({
  x,
  y,
  element,
  currentTime,
  onClose,
  onSplit,
  onDelete,
}: ClipContextMenuProps) {
  useLocale();
  const menuRef = useContextMenuDismiss(onClose);
  useMenuKeyboardNav(menuRef);

  const isSplittable = canSplitElement(element) && ["video", "audio", "img"].includes(element.tag);
  const canSplit =
    isSplittable && currentTime > element.start && currentTime < element.start + element.duration;

  const splitLabel = !isSplittable
    ? null
    : canSplit
      ? t("timeline.splitAt", { time: formatDecimalSeconds(currentTime) })
      : t("timeline.splitMoveInside");

  return (
    <TimelineMenuSurface
      ref={menuRef}
      label={t("timeline.clipActions")}
      x={x}
      y={y}
      estimatedHeight={splitLabel ? 88 : 48}
      onDismiss={onClose}
    >
      {splitLabel && (
        <TimelineMenuItem
          icon="split"
          hint="S"
          disabled={!canSplit}
          title={canSplit ? undefined : t("timeline.splitMoveTip")}
          onClick={() => {
            if (!canSplit) return;
            onSplit(element, currentTime);
            onClose();
          }}
        >
          {splitLabel}
        </TimelineMenuItem>
      )}
      <TimelineMenuItem
        icon="trash"
        hint="⌫"
        danger
        onClick={() => {
          onDelete(element);
          onClose();
        }}
      >
        {t("timeline.delete")}
      </TimelineMenuItem>
    </TimelineMenuSurface>
  );
});
