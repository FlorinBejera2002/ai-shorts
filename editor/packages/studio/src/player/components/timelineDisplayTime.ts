import { getStudioLocale, usesDecimalComma } from "../../i18n/translate";

/** Short M:SS readout used on the timeline boards ("0:08", "1:12"): clip lengths, ruler
 *  labels and the work-area points. Unlike formatTime, minutes are not zero-padded. */
export function formatShortTime(time: number): string {
  const safe = Number.isFinite(time) && time > 0 ? time : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Ruler labels arrive as "00:05" (or "1:00:05" past an hour); the board drops the leading
 *  zero of the minutes so they read "0:05". Frame counts pass through unchanged. */
export function shortenTickLabel(label: string | number): string {
  return typeof label === "number" ? String(label) : label.replace(/^0(\d:)/, "$1");
}

/** Seconds with two decimals in the UI language: "4.20" in English, "4,20" in Romanian. */
export function formatDecimalSeconds(time: number): string {
  return localizeDecimalText((Number.isFinite(time) ? time : 0).toFixed(2));
}

/** A formatted number ("0.27", "-3.5 dB") with the UI language's decimal separator. */
export function localizeDecimalText(text: string): string {
  return usesDecimalComma(getStudioLocale()) ? text.replace(/(\d)\.(\d)/g, "$1,$2") : text;
}
