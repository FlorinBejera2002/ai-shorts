// Phone track header (St-M-Timeline-TrackHeads): only the track glyph shows; tapping it opens
// a sheet with the clip count, the visibility toggle and the track's effect controls.
import { useState, type ReactNode } from "react";
import { t, useLocale } from "../../i18n/translate";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import { TimelineIcon, type TimelineIconName } from "./TimelineIcon";
import { TimelineMenuItem, TimelineMenuSurface } from "./TimelineMenu";
import { trackDisplaySuffix } from "./timelineTrackDisplay";

interface CompactTrackHeaderProps {
  icon: TimelineIconName;
  trackLabel: string;
  trackNumber: number;
  trackDisplayNumber: number | null;
  clipCount: number;
  isTrackHidden: boolean;
  /** Whether the hide control applies (not on an audible audio track). */
  canToggleVisibility: boolean;
  onToggleTrackHidden: TimelineEditCallbacks["onToggleTrackHidden"];
  trailing?: ReactNode;
}

function TrackSheet({
  props,
  rect,
  onClose,
}: {
  props: CompactTrackHeaderProps;
  rect: DOMRect;
  onClose: () => void;
}) {
  const menuRef = useContextMenuDismiss(onClose);
  const suffix = trackDisplaySuffix(props.trackDisplayNumber);
  return (
    <TimelineMenuSurface
      ref={menuRef}
      role="dialog"
      label={props.trackLabel}
      x={rect.right}
      y={rect.top}
      estimatedHeight={200}
      onDismiss={onClose}
    >
      {props.clipCount > 1 && (
        <span className="mb-1 inline-flex h-[26px] w-fit items-center rounded-sm px-2 text-xs font-semibold text-[var(--st-t2)] shadow-[inset_0_0_0_1px_var(--st-bd)]">
          {t("timeline.clipCount", { n: props.clipCount })}
        </span>
      )}
      {props.canToggleVisibility && (
        <TimelineMenuItem
          icon={props.isTrackHidden ? "eye" : "eyeOff"}
          onClick={() => {
            void props.onToggleTrackHidden?.(
              props.trackNumber,
              !props.isTrackHidden,
              props.trackDisplayNumber,
            );
            onClose();
          }}
        >
          {props.isTrackHidden
            ? t("timeline.showTrack", { suffix })
            : t("timeline.hideTrack", { suffix })}
        </TimelineMenuItem>
      )}
      {props.trailing && <div className="flex items-center gap-2 px-1">{props.trailing}</div>}
    </TimelineMenuSurface>
  );
}

export function CompactTrackHeader(props: CompactTrackHeaderProps) {
  useLocale();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={props.trackLabel}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        title={props.trackLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget.getBoundingClientRect());
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--st-t2)] hover:bg-[var(--st-sub)]"
        style={{ opacity: props.isTrackHidden ? 0.45 : 1 }}
      >
        <TimelineIcon name={props.icon} size={14} />
      </button>
      {anchor && <TrackSheet props={props} rect={anchor} onClose={() => setAnchor(null)} />}
    </>
  );
}
