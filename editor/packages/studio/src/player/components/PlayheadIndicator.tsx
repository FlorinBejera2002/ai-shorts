/**
 * The timeline playhead (St-Timeline-Tools): a 2px line in the text colour with a 10px round
 * head pinned to the ruler. The head is `position: sticky; top: 0` so it stays grabbable
 * while the tracks scroll vertically; it gains a ring while the playhead is scrubbed.
 */
import { PLAYHEAD_HEAD_W } from "./timelineLayout";

interface PlayheadIndicatorProps {
  /** CSS colour of the line and head; defaults to the text token. */
  color?: string;
  /** Whether the playhead is being actively scrubbed. */
  scrubbing?: boolean;
  /** When false, the head sits in normal flow instead of the sticky pin. */
  stickyHead?: boolean;
}

export function PlayheadIndicator({
  color = "var(--st-tx)",
  scrubbing = false,
  stickyHead = true,
}: PlayheadIndicatorProps) {
  // The wrapper is PLAYHEAD_HEAD_W wide and shifted left by half of it (see
  // getTimelinePlayheadLeft), so 50% of the wrapper is exactly contentOrigin + t * pps.
  const HEAD = PLAYHEAD_HEAD_W;
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute bottom-0 top-0"
        style={{ left: "50%", width: 2, marginLeft: -1, background: color }}
      />
      <div
        className={stickyHead ? "sticky" : "absolute"}
        style={{ left: 0, top: stickyHead ? 0 : 0, height: stickyHead ? 0 : undefined }}
      >
        <div
          data-playhead-head=""
          style={{
            width: HEAD,
            height: HEAD,
            borderRadius: 999,
            background: color,
            boxShadow: scrubbing
              ? `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)`
              : "none",
          }}
        />
      </div>
    </>
  );
}
