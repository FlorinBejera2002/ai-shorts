import { readClipTiming } from "@hyperframes/core/composition-contract";
import { SOURCE_WINDOW_TIMING_UPDATE_ATTR } from "@hyperframes/core/media-timing";
import type { DomEditSelection } from "../components/editor/domEditingTypes";

/** Preserve authored source values separately from the runtime's projected values. */
export function queueSourceCutTimingUpdate(live: Element, source: Element): void {
  if (!live.parentElement?.closest("[data-source-window]")) return;
  const timing = readClipTiming(source);
  if (timing.start == null || timing.duration == null) return;
  live.setAttribute(
    SOURCE_WINDOW_TIMING_UPDATE_ATTR,
    JSON.stringify({
      start: timing.start,
      duration: timing.duration,
      mediaStart:
        Number(
          source.getAttribute("data-media-start") ?? source.getAttribute("data-playback-start"),
        ) || 0,
      playbackRate: Number(source.getAttribute("data-playback-rate")) || 1,
      hidden: source.hasAttribute("data-hidden"),
      automation: source.getAttribute("data-automation"),
    }),
  );
}

export function syncSourceCutAuthoredTiming(selection: DomEditSelection, html: string): void {
  const source = new DOMParser().parseFromString(html, "text/html");
  const authoredId = selection.element.getAttribute("data-hf-authored-id") || selection.id;
  const element = authoredId ? source.getElementById(authoredId) : null;
  if (element) queueSourceCutTimingUpdate(selection.element, element);
}
