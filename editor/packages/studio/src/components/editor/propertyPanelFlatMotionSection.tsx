import { scopedElementKey } from "../../hooks/gsapKeyframeCacheHelpers";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import type { DomEditSelection } from "./domEditing";
import { formatTimingValue } from "./propertyPanelHelpers";
import { parseTimingValue } from "./propertyPanelTimingSection";
import { CommitField } from "./propertyPanelPrimitives";
import { t, useLocale } from "../../i18n/translate";
import type { GsapAnimationEditCallbacks } from "./gsapAnimationCallbacks";
import { deriveElementTiming } from "./propertyPanelFlatTimingDerivation";
import { GsapAnimationList } from "./GsapAnimationList";

export function FlatTimingRow({
  element,
  animations = [],
  onSetAttribute,
  onSetAttributes,
}: {
  element: DomEditSelection;
  animations?: GsapAnimation[];
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  /** Commits start+duration together in ONE atomic persist call, bound to
   *  THIS render's `element` explicitly — not whatever is "currently"
   *  selected by the time the call resolves. Falls back to two sequential
   *  `onSetAttribute` calls (with the same non-atomicity/misdirection risk
   *  documented below) when the caller doesn't wire it up. */
  onSetAttributes?: (selection: DomEditSelection, attrs: Record<string, string>) => Promise<void>;
}) {
  const track = useTrackDesignInput();
  const { start, duration, inferred: derived } = deriveElementTiming(element, animations);
  const end = start + duration;

  // While the range is inferred from animations, editing ONE field must pin the
  // WHOLE displayed range: writing only data-duration flips inference off and
  // drops start to data-start-or-0 (the clip silently shifts), and writing only
  // data-start is ignored while duration is still inferred (the edit looks
  // dead). Pin both attributes in ONE atomic commit bound to THIS element —
  // two sequential `onSetAttribute` calls would each resolve `domEditSelection`
  // fresh from current hook state, so a selection change between the two
  // awaits could misdirect the second write at the newly-selected element, and
  // a failure of just the second call would leave the pair half-applied.
  const pinRange = async (nextStart: number, nextDuration: number) => {
    const attrs = { start: nextStart.toFixed(2), duration: nextDuration.toFixed(2) };
    if (onSetAttributes) {
      await onSetAttributes(element, attrs);
      return;
    }
    await onSetAttribute("start", attrs.start);
    await onSetAttribute("duration", attrs.duration);
  };

  const commitStart = (nextValue: string) => {
    const parsed = parseTimingValue(nextValue);
    if (parsed == null) return;
    if (derived) {
      void pinRange(parsed, duration);
      return;
    }
    void onSetAttribute("start", parsed.toFixed(2));
  };

  const commitDuration = (nextValue: string) => {
    const parsed = parseTimingValue(nextValue);
    if (parsed == null || parsed <= 0) return;
    if (derived) {
      void pinRange(start, parsed);
      return;
    }
    void onSetAttribute("duration", parsed.toFixed(2));
  };

  const commitEnd = (nextValue: string) => {
    const parsed = parseTimingValue(nextValue);
    if (parsed == null || parsed <= start) return;
    if (derived) {
      void pinRange(start, parsed - start);
      return;
    }
    void onSetAttribute("duration", (parsed - start).toFixed(2));
  };

  useLocale();
  const cell = (label: string, value: string, onCommit: (next: string) => void) => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-medium text-studio-muted">{label}</span>
      <span className="flex h-11 min-w-0 items-center rounded-md bg-studio-surface px-3 text-[13px] font-medium tabular-nums text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] focus-within:shadow-[inset_0_0_0_2px_var(--st-btn)]">
        <CommitField
          value={value}
          onCommit={(next) => {
            track("metric", label);
            onCommit(next);
          }}
        />
      </span>
    </label>
  );

  return (
    <div
      className="grid grid-cols-3 gap-2.5"
      title={derived ? t("motion.inferred") : undefined}
      data-timing-inferred={derived ? "true" : undefined}
    >
      {cell(t("motion.start"), formatTimingValue(start), commitStart)}
      {cell(t("motion.end"), formatTimingValue(end), commitEnd)}
      {cell(t("motion.duration"), formatTimingValue(duration), commitDuration)}
    </div>
  );
}

export function FlatMotionSection({
  element,
  animations,
  showTiming,
  showEffects,
  multipleTimelines,
  unsupportedTimelinePattern,
  onSetAttribute,
  onSetAttributes,
  onAddAnimation,
  ...callbacks
}: {
  element: DomEditSelection;
  animations: GsapAnimation[];
  showTiming: boolean;
  showEffects: boolean;
  multipleTimelines?: boolean;
  unsupportedTimelinePattern?: boolean;
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  onSetAttributes?: (selection: DomEditSelection, attrs: Record<string, string>) => Promise<void>;
  onAddAnimation: (method: "to" | "from" | "set" | "fromTo") => void;
} & GsapAnimationEditCallbacks) {
  // Only consume a focus request aimed at the element THIS panel renders (not
  // the store's selectedElementId, which flips synchronously during async
  // selection resolution), so a shared class-selector animation id can't open
  // the wrong element's editor.
  const renderedElementId = scopedElementKey(element);
  useLocale();

  return (
    <div className="flex flex-col gap-3.5">
      {showTiming && (
        <FlatTimingRow
          element={element}
          animations={animations}
          onSetAttribute={onSetAttribute}
          onSetAttributes={onSetAttributes}
        />
      )}
      {showEffects && (
        <>
          {multipleTimelines && (
            <p
              role="status"
              className="rounded-md bg-[var(--st-warn-bg)] px-3 py-2.5 text-[13px] font-medium text-[var(--st-warn-text)]"
            >
              {t("motion.multipleTimelines")}
            </p>
          )}
          {unsupportedTimelinePattern && (
            <p
              role="status"
              className="rounded-md bg-[var(--st-warn-bg)] px-3 py-2.5 text-[13px] font-medium text-[var(--st-warn-text)]"
            >
              {t("motion.computedKey")}
            </p>
          )}
          {!multipleTimelines && !unsupportedTimelinePattern && (
            <GsapAnimationList
              {...callbacks}
              elementId={renderedElementId}
              animations={animations}
              onAddAnimation={onAddAnimation}
              variant="flat"
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * What the Motion section is called, and what its collapsed line says.
 *
 * "Motion" names the tween editor. On audio the section is Start/Duration/End
 * and nothing else, so the label would promise what it no longer offers — and
 * "Motion: 0 effects" on a sound is a category error, hence the span instead of
 * a count.
 *
 * Keyed on the TAG by its caller, not on whether the effects half is showing:
 * that half also disappears when a host simply has not wired the GSAP handlers,
 * and a div in that state is still a thing that moves — renaming its section
 * would be describing the host's wiring rather than the element.
 */
export function motionSectionLabel(args: {
  timingOnly: boolean;
  start: number;
  duration: number;
  effectCount: number;
}): { title: string; summary: string } {
  if (args.timingOnly) {
    return {
      title: "Timing",
      summary: `${formatTimingValue(args.start)} – ${formatTimingValue(args.start + args.duration)}`,
    };
  }
  return {
    title: "Motion",
    summary: `${args.effectCount} effect${args.effectCount === 1 ? "" : "s"}`,
  };
}
