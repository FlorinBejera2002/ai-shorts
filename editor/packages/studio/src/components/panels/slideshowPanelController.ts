/**
 * Pure manifest parsing and notes-debounce controller for SlideshowPanel. Kept
 * out of the component file so the flush-attribution invariant can be tested
 * without a DOM or React renderer.
 */

import { parseSlideshowManifest } from "@hyperframes/core/slideshow";
import type { SlideshowManifest } from "@hyperframes/core/slideshow";

export function safeParseManifest(html: string): SlideshowManifest {
  try {
    return parseSlideshowManifest(html) ?? { slides: [] };
  } catch {
    return { slides: [] };
  }
}

// ── Notes-attribution controller (pure, testable) ─────────────────────────
//
// The React component delegates debounce scheduling to these functions so
// the flush-attribution invariant can be tested without a DOM or React renderer.

export interface NotesController {
  /** Record a notes keystroke; returns the timer id. */
  schedule: (
    manifest: SlideshowManifest,
    persist: (m: SlideshowManifest) => Promise<void>,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  /** Flush any pending notes synchronously (e.g. on comp-switch or unmount). */
  flush: () => void;
  /** Cancel without flushing (used when a discrete action absorbs the notes). */
  cancel: () => void;
  /** Merge any pending notes into an incoming discrete manifest, then clear. */
  mergeIntoDiscrete: (next: SlideshowManifest) => SlideshowManifest;
}

export function makeSlideshowNotesController(): NotesController {
  type Pending = { manifest: SlideshowManifest; persist: (m: SlideshowManifest) => Promise<void> };
  let pending: Pending | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Atomically swap the pending entry out and fire its persist (if any).
  // Used by both the debounce timer's tail and the explicit flush() path.
  const drainPending = (): void => {
    const p = pending;
    if (p === null) return;
    pending = null;
    p.persist(p.manifest).catch((err: unknown) => {
      console.error("[slideshow] notes persist failed:", err);
    });
  };

  return {
    schedule(manifest, persist, delayMs) {
      if (timer !== null) clearTimeout(timer);
      pending = { manifest, persist };
      timer = setTimeout(() => {
        timer = null;
        drainPending();
      }, delayMs);
      return timer;
    },

    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      drainPending();
    },

    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    },

    mergeIntoDiscrete(next) {
      const p = pending;
      if (p === null) return next;
      pending = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      return {
        ...next,
        slides: next.slides.map((slide) => {
          const ps = p.manifest.slides.find((s) => s.sceneId === slide.sceneId);
          if (ps?.notes !== undefined && slide.notes === undefined) {
            return { ...slide, notes: ps.notes };
          }
          return slide;
        }),
      };
    },
  };
}
