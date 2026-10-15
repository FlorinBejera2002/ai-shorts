import { projectSourceWindow, SOURCE_WINDOW_ATTR } from "../mediaTiming";
import { readClipTiming } from "../compositionContract";
import { resolveAuthoredTimingWindow } from "./authoredTiming";
import { readElementPlaybackRate, readMediaStart } from "./playbackRate";
import { parseAutomation, projectAutomationTime, serializeAutomation } from "../audioAutomation";
import { parseAudioFxChain } from "../audioFx";

interface SourceTiming {
  start: number;
  duration: number;
  mediaStart: number;
  playbackRate: number;
  hidden: boolean;
  automation: string | null;
}
const authored = new WeakMap<Element, SourceTiming>();

function setAttribute(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** Imported scenes retain full source contents. Project only their visible host window,
 * keeping picture, camera audio and timed captions on the same source clock. */
export function projectSourceCompositionWindows(doc: Document): void {
  for (const host of doc.querySelectorAll(`[${SOURCE_WINDOW_ATTR}]`)) {
    const publicDuration = host.getAttribute("data-duration");
    const publicEnd = host.getAttribute("data-end");
    const hostDuration = resolveAuthoredTimingWindow({
      start: readClipTiming(host).start ?? 0,
      duration: publicDuration,
      end: publicEnd,
      // A live end-based edit replaces the previously preserved duration.
      authoredDuration:
        publicDuration == null && publicEnd != null
          ? null
          : host.getAttribute("data-hf-authored-duration"),
      authoredEnd: host.getAttribute("data-hf-authored-end"),
    })?.duration;
    if (hostDuration == null || !Number.isFinite(hostDuration) || hostDuration <= 0) continue;
    const hostPlaybackStart = readMediaStart(host);
    const hostPlaybackRate = readElementPlaybackRate(host);
    for (const child of host.querySelectorAll("[data-start]")) {
      // Project nested source hosts first, then their media through that window.
      // Otherwise a trimmed project leaves its nested scenes on the old clock.
      if (child.parentElement?.closest(`[${SOURCE_WINDOW_ATTR}]`) !== host) continue;
      if (child.hasAttribute("data-composition-id") && !child.hasAttribute(SOURCE_WINDOW_ATTR))
        continue;
      let timing = authored.get(child);
      if (!timing) {
        const clipTiming = readClipTiming(child);
        if (clipTiming.start == null || clipTiming.duration == null) continue;
        timing = {
          start: clipTiming.start,
          duration: clipTiming.duration,
          mediaStart: readMediaStart(child),
          playbackRate: readElementPlaybackRate(child),
          hidden: child.hasAttribute("data-hidden"),
          automation: child.getAttribute("data-automation"),
        };
        if (!Number.isFinite(timing.start) || !Number.isFinite(timing.duration)) continue;
        authored.set(child, timing);
      }
      const window = child.hasAttribute("data-cut-boundary")
        ? {
            start: 0,
            duration: Math.min(timing.duration, hostDuration),
            mediaStart: 0,
            playbackRate: 1,
          }
        : projectSourceWindow({
            ...timing,
            hostStart: 0,
            hostDuration,
            hostPlaybackStart,
            hostPlaybackRate,
          });
      setAttribute(child, "data-start", String(window.start));
      const hasPreservedWindow =
        child.hasAttribute(SOURCE_WINDOW_ATTR) &&
        (child.hasAttribute("data-hf-authored-duration") ||
          child.hasAttribute("data-hf-authored-end"));
      if (hasPreservedWindow) {
        // Runtime publication strips public composition timing. Reintroducing
        // it here would wake its MutationObserver again after every publication.
        setAttribute(child, "data-hf-authored-duration", String(window.duration));
        child.removeAttribute("data-hf-authored-end");
      } else {
        setAttribute(child, "data-duration", String(window.duration));
        setAttribute(child, "data-end", String(window.start + window.duration));
      }
      setAttribute(child, "data-source-window-projected", "");
      // Edit source contents in their own composition; the parent scene owns trim.
      setAttribute(child, "data-timeline-locked", "");
      if (["VIDEO", "AUDIO"].includes(child.tagName) || child.hasAttribute(SOURCE_WINDOW_ATTR)) {
        setAttribute(child, "data-media-start", String(window.mediaStart));
        if (child.hasAttribute("data-playback-start") || child.hasAttribute(SOURCE_WINDOW_ATTR))
          setAttribute(child, "data-playback-start", String(window.mediaStart));
        setAttribute(child, "data-playback-rate", String(window.playbackRate));
        if (timing.automation) {
          try {
            const chain = child.getAttribute("data-fx-chain");
            setAttribute(
              child,
              "data-automation",
              serializeAutomation(
                projectAutomationTime(
                  parseAutomation(timing.automation),
                  Math.max(0, (window.mediaStart - timing.mediaStart) / timing.playbackRate),
                  window.playbackRate / timing.playbackRate,
                  chain ? parseAudioFxChain(chain) : undefined,
                ),
              ),
            );
          } catch {
            // Invalid authored automation keeps the existing runtime fallback.
          }
        }
      }
      if (timing.hidden || window.duration <= 0) setAttribute(child, "data-hidden", "");
      else if (child.hasAttribute("data-hidden")) child.removeAttribute("data-hidden");
    }
  }
}
