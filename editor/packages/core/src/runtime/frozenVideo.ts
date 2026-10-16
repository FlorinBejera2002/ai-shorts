import { parseStrictFiniteTimingNumber } from "./playbackRate.js";

/** A picture-only video holds this source time throughout its authored slot. */
export function readVideoFreezeTime(el: Pick<Element, "tagName" | "getAttribute">): number | null {
  if (el.tagName.toUpperCase() !== "VIDEO") return null;
  const value = parseStrictFiniteTimingNumber(el.getAttribute("data-freeze-at"));
  return value != null && value >= 0 ? value : null;
}
