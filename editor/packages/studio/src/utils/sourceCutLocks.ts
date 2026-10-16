import { SOURCE_WINDOW_TIMING_LOCK_ATTR } from "@hyperframes/core/media-timing";

/** A projected timing lock stops trim, while an authored lock also stops canvas edits. */
export function isInsideAuthoredLockedComposition(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (!current.hasAttribute("data-timeline-locked")) continue;
    const host = current.closest<HTMLElement>("[data-source-window][id]");
    const canonical =
      host &&
      /^source-scene-\d+\.html$/.test(
        host.getAttribute("data-composition-src") ??
          host.getAttribute("data-composition-file") ??
          "",
      );
    if (!canonical || !current.hasAttribute(SOURCE_WINDOW_TIMING_LOCK_ATTR)) return true;
  }
  return false;
}
