import {
  projectSourceWindow,
  SOURCE_WINDOW_ATTR,
  SOURCE_WINDOW_TIMING_UPDATE_ATTR,
  SOURCE_WINDOW_TIMING_LOCK_ATTR,
} from "../mediaTiming";
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

function consumeAuthoredTimingUpdate(child: Element, timing: SourceTiming): SourceTiming {
  const update = child.getAttribute(SOURCE_WINDOW_TIMING_UPDATE_ATTR);
  if (update == null) return timing;
  child.removeAttribute(SOURCE_WINDOW_TIMING_UPDATE_ATTR);
  try {
    const next = JSON.parse(update) as SourceTiming;
    if (
      ![next.start, next.duration, next.mediaStart, next.playbackRate].every(Number.isFinite) ||
      next.duration < 0 ||
      next.playbackRate <= 0 ||
      typeof next.hidden !== "boolean" ||
      (next.automation !== null && typeof next.automation !== "string")
    )
      return timing;
    authored.set(child, next);
    return next;
  } catch {
    return timing;
  }
}

function setAttribute(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function sourceWindowDuration(host: Element): number | null | undefined {
  const publicDuration = host.getAttribute("data-duration");
  const publicEnd = host.getAttribute("data-end");
  return resolveAuthoredTimingWindow({
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
}

/** Hold crop/visual animation at selected boundaries just like a frozen picture.
 * Legacy compositions without source windows retain their existing timeline clock.
 */
export function sourceCompositionAnimationTime(host: Element, elapsed: number): number {
  const duration = host.hasAttribute(SOURCE_WINDOW_ATTR) ? sourceWindowDuration(host) : null;
  const boundedElapsed = Math.max(0, duration == null ? elapsed : Math.min(duration, elapsed));
  const sourceElapsed = boundedElapsed * readElementPlaybackRate(host);
  // The selected end is exclusive: a step/crop keyframe exactly there belongs
  // to excluded footage, just like the frame excluded by data-freeze-at.
  return (
    readMediaStart(host) +
    Math.max(0, duration != null && elapsed >= duration ? sourceElapsed - 0.000001 : sourceElapsed)
  );
}

/** Imported scenes retain full source contents. Project only their visible host window,
 * keeping picture, camera audio and timed captions on the same source clock. */
export function projectSourceCompositionWindows(doc: Document): void {
  for (const host of doc.querySelectorAll(`[${SOURCE_WINDOW_ATTR}]`)) {
    const hostDuration = sourceWindowDuration(host);
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
      timing = consumeAuthoredTimingUpdate(child, timing);
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
      // The parent owns trim; canvas appearance remains editable. Preserve an
      // explicit authored lock separately from this runtime-only timing lock.
      if (!child.hasAttribute("data-timeline-locked"))
        setAttribute(child, SOURCE_WINDOW_TIMING_LOCK_ATTR, "");
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
        } else if (child.hasAttribute("data-automation")) child.removeAttribute("data-automation");
      }
      if (timing.hidden || window.duration <= 0) setAttribute(child, "data-hidden", "");
      else if (child.hasAttribute("data-hidden")) child.removeAttribute("data-hidden");
    }
  }
}
