import type React from "react";
import { t, useLocale } from "../../i18n/translate";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import { TimelineIcon, type TimelineIconName } from "./TimelineIcon";
import { TrackClipCount } from "./TrackClipCount";
import { trackDisplaySuffix } from "./timelineTrackDisplay";
import { CompactTrackHeader } from "./TimelineTrackCompactHeader";

/** What a track holds, for its header glyph (St-Timeline-Tools: Video, Subtitrări, Text, Voce, Muzică). */
export type TrackKind = "media" | "audio" | "text" | "captions";

const KIND_ICON: Record<TrackKind, TimelineIconName> = {
  media: "media",
  audio: "music",
  text: "text",
  captions: "subs",
};

/** The header glyph for a kind of track. */
export function trackKindIcon(kind: TrackKind): TimelineIconName {
  return KIND_ICON[kind];
}

// Hide, plainly. The speaker variant was the mute presentation; with mute gone
// this is the visibility eye it always was, and audio rows do not render it.
function visibilityButtonLabel(hidden: boolean, suffix: string): string {
  return hidden ? t("timeline.showTrack", { suffix }) : t("timeline.hideTrack", { suffix });
}

export function VisibilityButton({
  hidden,
  trackNumber,
  trackDisplayNumber,
  visible,
  onToggle,
}: {
  hidden: boolean;
  trackNumber: number;
  trackDisplayNumber: number | null;
  visible: boolean;
  onToggle: TimelineEditCallbacks["onToggleTrackHidden"];
}) {
  useLocale();
  if (!visible) return <span aria-hidden="true" className="h-6 w-6 shrink-0" />;
  // Display number in the text, real key in the callback. The two must not be
  // conflated in either direction.
  const suffix = trackDisplaySuffix(trackDisplayNumber);
  const label = visibilityButtonLabel(hidden, suffix);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--st-t2)] transition-colors hover:bg-[var(--st-sub)] hover:text-[var(--st-tx)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--st-tx)]"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        // Display number alongside the real key: the undo-history label must
        // announce the same row this button just did (see `onToggleTrackHidden`).
        void onToggle?.(trackNumber, !hidden, trackDisplayNumber);
      }}
    >
      <TimelineIcon name={hidden ? "eyeOff" : "eye"} size={14} />
    </button>
  );
}

// The header a track gets when it has no keyframe clip to disclose: glyph, name, clip count,
// eye. Not deprecated: it is the live path for every track without lanes.
export function PlainTrackHeader({
  trackNumber,
  trackDisplayNumber,
  trackLabel,
  trackKind,
  clipCount,
  showTrackLabel,
  isTrackHidden,
  isAudioTrack,
  isHighlighted = false,
  onToggleTrackHidden,
  trailing,
}: {
  trackNumber: number;
  trackDisplayNumber: number | null;
  trackLabel: string;
  trackKind?: TrackKind;
  clipCount: number;
  isTrackHidden: boolean;
  isAudioTrack: boolean;
  /** The selection lives on this track: the name switches from secondary to primary text. */
  isHighlighted?: boolean;
  onToggleTrackHidden: TimelineEditCallbacks["onToggleTrackHidden"];
  showTrackLabel: boolean;
  /** Trailing controls that belong on the control line — the FX entry points,
   *  which the caller owns because only it knows the clip they act on. */
  trailing?: React.ReactNode;
}) {
  const kind = trackKind ?? (isAudioTrack ? "audio" : "media");
  if (!showTrackLabel) {
    return (
      <CompactTrackHeader
        icon={KIND_ICON[kind]}
        trackLabel={trackLabel}
        trackNumber={trackNumber}
        trackDisplayNumber={trackDisplayNumber}
        clipCount={clipCount}
        isTrackHidden={isTrackHidden}
        canToggleVisibility={!isAudioTrack || isTrackHidden}
        onToggleTrackHidden={onToggleTrackHidden}
        trailing={trailing}
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <div
        className="flex min-w-0 items-center gap-1.5 text-xs font-semibold"
        style={{ color: isHighlighted ? "var(--st-tx)" : "var(--st-t2)" }}
      >
        <TimelineIcon name={KIND_ICON[kind]} size={14} />
        {/* The name truncates; the controls hold the right edge (`shrink-0`, `ml-auto`). */}
        {showTrackLabel && (
          <span className="min-w-0 flex-1 truncate leading-tight" title={trackLabel}>
            {trackLabel}
          </span>
        )}
        {/* St-Timeline-TrackHeads: the FX entry sits before the eye, and the eye holds the
            column's right edge. */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {trailing}
          {/* Not on an audible audio track: there the eye would silence rather than hide, and
            the row already says what it is. Offered again once the track IS hidden, since
            nothing else restores a hidden audio track. With trailing controls the audio row
            drops the eye spacer, so its FX entry takes the eye column (St-Timeline-TrackHeads)
            and the name keeps room; without them the spacer keeps the columns aligned. */}
          {(!isAudioTrack || isTrackHidden || !trailing) && (
            <VisibilityButton
              hidden={isTrackHidden}
              trackNumber={trackNumber}
              trackDisplayNumber={trackDisplayNumber}
              visible={!isAudioTrack || isTrackHidden}
              onToggle={onToggleTrackHidden}
            />
          )}
        </div>
      </div>
      <TrackClipCount clipCount={clipCount} variant="line" />
    </div>
  );
}
