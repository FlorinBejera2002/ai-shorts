// Readouts used by the preview transport (St-Preview boards): "0:08 / 0:45", "0:02.40", "1,5×".
import { formatFrameTime, stepFrameTime } from "../../lib/time";
import type { StudioLocale } from "../../../i18n/dictionary";
import { usesDecimalComma } from "../../../i18n/translate";

/** M:SS (minutes unpadded), the board's transport readout. */
export function formatTransportTime(time: number): string {
  const safe = Number.isFinite(time) && time > 0 ? time : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** M:SS.cc for work-area points ("0:02.40"). */
export function formatPointTime(time: number): string {
  const safe = Number.isFinite(time) && time > 0 ? time : 0;
  const hundredths = Math.floor((safe % 1) * 100 + 1e-6);
  return `${formatTransportTime(safe)}.${hundredths.toString().padStart(2, "0")}`;
}

/** "0:08 / 0:45" or "240f / 1350f". */
export function formatTransportReadout(
  time: number,
  duration: number,
  mode: "time" | "frame",
): string {
  return mode === "frame"
    ? formatFrameTime(time, duration)
    : `${formatTransportTime(time)} / ${formatTransportTime(duration)}`;
}

/** Playback rate label with the locale's decimal separator ("0,25×" in Romanian). */
export function formatRate(rate: number, locale: StudioLocale): string {
  const text = String(rate);
  return `${usesDecimalComma(locale) ? text.replace(".", ",") : text}×`;
}

/** Time one frame before or after `time`, clamped to [0, duration]. */
export function stepTransportFrame(time: number, delta: number, duration: number): number {
  const next = stepFrameTime(time, delta);
  return duration > 0 ? Math.min(duration, next) : next;
}
