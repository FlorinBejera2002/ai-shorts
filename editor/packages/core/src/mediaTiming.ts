export const MEDIA_START_BASIS_ATTR = "data-hf-media-start-basis";
export const SOURCE_WINDOW_ATTR = "data-source-window";
/** One-shot Studio update of authored timing, before source-window projection. */
export const SOURCE_WINDOW_TIMING_UPDATE_ATTR = "data-hf-source-timing-update";
export const SOURCE_WINDOW_TIMING_LOCK_ATTR = "data-hf-source-timing-lock";

export interface SourceWindow {
  start: number;
  duration: number;
  mediaStart: number;
  playbackRate: number;
}

/** Project a child media slot through a trimmed composition's source clock. */
export function projectSourceWindow(
  input: SourceWindow & {
    hostStart: number;
    hostDuration: number;
    hostPlaybackStart: number;
    hostPlaybackRate: number;
  },
): SourceWindow {
  const hostRate =
    Number.isFinite(input.hostPlaybackRate) && input.hostPlaybackRate > 0
      ? input.hostPlaybackRate
      : 1;
  const childRate =
    Number.isFinite(input.playbackRate) && input.playbackRate > 0 ? input.playbackRate : 1;
  const visibleStart = Math.max(input.start, input.hostPlaybackStart);
  const visibleEnd = Math.min(
    input.start + Math.max(0, input.duration),
    input.hostPlaybackStart + Math.max(0, input.hostDuration) * hostRate,
  );
  return {
    start: input.hostStart + (visibleStart - input.hostPlaybackStart) / hostRate,
    duration: Math.max(0, visibleEnd - visibleStart) / hostRate,
    mediaStart: input.mediaStart + (visibleStart - input.start) * childRate,
    playbackRate: childRate * hostRate,
  };
}

export type MediaStartBasis = "local" | "global";

export function readMediaStartBasis(value: string | null | undefined): MediaStartBasis {
  return value?.trim().toLowerCase() === "global" ? "global" : "local";
}

/** Resolve authored media time onto the root timeline. Nested media is local
 * by default; only an explicit compatibility marker preserves a legacy
 * root-global value. */
export function resolveAbsoluteMediaStartSeconds(input: {
  authoredStart: number;
  hostStart: number;
  basis?: string | null;
}): number {
  return readMediaStartBasis(input.basis) === "global"
    ? input.authoredStart
    : input.hostStart + input.authoredStart;
}
