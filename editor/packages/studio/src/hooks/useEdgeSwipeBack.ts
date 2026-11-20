import { useEffect, useRef } from "react";

/** Touches must start this close to the left edge (CSS px). Matches the SneepCut app. */
const EDGE = 24;
/** Distance that commits the swipe on release. */
const COMMIT_DISTANCE = 96;
/** A shorter, quick flick also commits. */
const FLICK_DISTANCE = 40;
const FLICK_SPEED = 0.5;
/** Movement before the gesture decides between horizontal and vertical. */
const DECIDE_AFTER = 10;

type Point = { x: number; y: number; time: number };

function toPoint(touch: Touch): Point {
  return { x: touch.clientX, y: touch.clientY, time: performance.now() };
}

/** Whether a finished touch from `start` to `end` is a deliberate swipe back. */
export function isSwipeBack(start: Point, end: Point): boolean {
  const dx = end.x - start.x;
  if (Math.abs(end.y - start.y) >= dx) return false;
  if (dx >= COMMIT_DISTANCE) return true;
  return dx >= FLICK_DISTANCE && dx / Math.max(end.time - start.time, 1) >= FLICK_SPEED;
}

/**
 * Swiping right from the left screen edge runs `onBack`, like iOS. Passive listeners never
 * block scrolling; when Safari's own back swipe takes over, the page gets touchcancel instead.
 */
export function useEdgeSwipeBack(onBack: () => void, enabled: boolean) {
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!enabled) return;
    let start: Point | null = null;
    let vertical = false;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch && touch.clientX <= EDGE ? toPoint(touch) : null;
      vertical = false;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!start || !touch || vertical) return;
      const dx = touch.clientX - start.x;
      const dy = Math.abs(touch.clientY - start.y);
      if (Math.max(Math.abs(dx), dy) >= DECIDE_AFTER && (dx <= 0 || dy >= dx)) vertical = true;
    };
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const swiped = Boolean(start && touch && !vertical && isSwipeBack(start, toPoint(touch)));
      start = null;
      if (swiped) handler.current();
    };
    const onCancel = () => {
      start = null;
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled]);
}
