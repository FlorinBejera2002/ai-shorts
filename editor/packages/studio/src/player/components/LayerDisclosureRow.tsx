import { LABEL_COL_W, TRACK_H } from "./timelineLayout";
import { t } from "../../i18n/translate";
import { TrackClipCount } from "./TrackClipCount";
import { TimelineIcon, type TimelineIconName } from "./TimelineIcon";

// Layer row (diamond, name, then the ∿ disclosure on the right edge) — the
// disclosure lives
// here, not on the clip bar, and re-expands a collapsed layer. `∿` (not a
// caret) because a group's own row keeps the caret for its structural
// disclosure (member rows) — this button only ever means "show this row's
// lanes", so it needs its own distinct glyph.
/**
 * The `∿` that shows or hides a row's lanes.
 *
 * Shared, because two layouts need the identical control: the keyframe layer
 * row below, and the plain track header — an audio track with automation keeps
 * its own look (music glyph, indent) and gains this, rather than being
 * re-rendered as a keyframe layer to get at the button.
 */
export function LaneToggleButton({
  name,
  isExpanded,
  lanesId,
  onToggle,
}: {
  name: string;
  isExpanded: boolean;
  lanesId: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      // ponytail: No focus id here; keyboard routing belongs to the enclosing logical row.
      tabIndex={-1}
      aria-expanded={isExpanded}
      aria-controls={lanesId}
      aria-label={t(isExpanded ? "timeline.hideLanesFor" : "timeline.showLanesFor", {
        label: name,
      })}
      title={t(isExpanded ? "timeline.hideLanes" : "timeline.showLanes")}
      // h-6 w-6 = the 24x24 WCAG 2.2 minimum target. The glyph stays 11px;
      // only the hit box grows.
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-[11px] leading-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--st-tx)] ${
        isExpanded ? "text-[var(--st-tx)]" : "text-[var(--st-t2)] hover:text-[var(--st-tx)]"
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <span aria-hidden="true">∿</span>
    </button>
  );
}

export function LayerDisclosureRow({
  name,
  label = name,
  icon,
  isHighlighted = false,
  clipCount,
  isExpanded,
  gutterBackground,
  columnWidth,
  lanesId,
  onToggleClipExpanded,
  children,
}: {
  /** What this row is called. The active clip's own name when it is alone on the
   *  track; the track itself once it holds several, since naming a shared row
   *  after one of its clips reads as if the rows under it were that clip's. */
  name: string;
  /** The visible name. Defaults to `name`; a multi-clip track shows its kind (Video, Text). */
  label?: string;
  /** The track glyph, as on a plain header. */
  icon: TimelineIconName;
  /** The selection lives on this track: the name switches to primary text. */
  isHighlighted?: boolean;
  clipCount: number;
  isExpanded: boolean;
  gutterBackground: string;
  /** Same adaptive width the lane rows use: a narrowed header column must not
   *  leave this row hanging over the clips it labels. */
  columnWidth: number;
  /** Id of the CANVAS-side element holding the diamond lanes this row's caret
   *  expands (see TimelinePropertyLanes). The caret also reveals the per-lane
   *  control rows in this column, but the diamonds are what following the
   *  reference should land on. */
  lanesId: string;
  onToggleClipExpanded: () => void;
  /** Trailing controls that act on the LAYER (the visibility eye), not on a lane. */
  children?: React.ReactNode;
}) {
  if (columnWidth < LABEL_COL_W) {
    // Phone column (St-M-Timeline-Keyframes): the track glyph alone, which is also the lane
    // toggle, so the lanes stay reachable without a second control the column cannot fit.
    return (
      <div
        className="absolute left-0 top-0 flex items-center justify-center"
        style={{ width: columnWidth, height: TRACK_H, background: gutterBackground }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-expanded={isExpanded}
          aria-controls={lanesId}
          aria-label={t(isExpanded ? "timeline.hideLanesFor" : "timeline.showLanesFor", {
            label: name,
          })}
          title={label}
          className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent p-0"
          style={{ color: isHighlighted || isExpanded ? "var(--st-tx)" : "var(--st-t2)" }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleClipExpanded();
          }}
        >
          <TimelineIcon name={icon} size={14} />
        </button>
      </div>
    );
  }
  // St-Timeline-Keyframes: the same two lines as a plain header (glyph, name, eye, then the
  // clip count under the name), with the lane toggle holding the right edge. The 112px column
  // cannot fit a wrapping name beside three controls, so the name truncates with a tooltip.
  return (
    <div
      className="absolute left-0 top-0 flex flex-col justify-center gap-px overflow-hidden pr-1"
      style={{ width: columnWidth, height: TRACK_H, background: gutterBackground }}
    >
      <div
        className="flex min-w-0 items-center gap-1.5 text-xs font-semibold"
        style={{ color: isHighlighted ? "var(--st-tx)" : "var(--st-t2)" }}
      >
        <TimelineIcon name={icon} size={14} />
        <span className="min-w-0 flex-1 truncate leading-tight" title={label}>
          {label}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {children}
          <LaneToggleButton
            name={name}
            isExpanded={isExpanded}
            lanesId={lanesId}
            onToggle={onToggleClipExpanded}
          />
        </div>
      </div>
      <TrackClipCount clipCount={clipCount} variant="line" />
    </div>
  );
}
