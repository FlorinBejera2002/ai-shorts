import { t, useLocale } from "../../i18n/translate";

/**
 * How many clips the track holds, shown next to the track's identity so a
 * multi-clip track reads as one at a glance. A single-clip track shows nothing:
 * the clip bar already says "one", and the header stays low-density.
 */
export function TrackClipCount({
  clipCount,
  variant = "chip",
}: {
  clipCount: number;
  /** "line": the board's sub-line under the track name ("17 clipuri", St-Timeline-TrackHeads). */
  variant?: "chip" | "line";
}) {
  useLocale();
  if (clipCount < 2) return null;
  const label = t("timeline.clipCount", { n: clipCount });
  if (variant === "line") {
    return (
      <span
        title={label}
        className="truncate pl-5 text-[11px] font-medium leading-[14px] text-[var(--st-t3)]"
      >
        {label}
      </span>
    );
  }
  return (
    <span
      aria-label={label}
      title={label}
      className="shrink-0 rounded-sm px-1 text-[10px] font-semibold leading-4 tabular-nums text-[var(--st-t3)] shadow-[inset_0_0_0_1px_var(--st-bd)]"
    >
      {clipCount}
    </span>
  );
}
