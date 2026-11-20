/**
 * Edge swipe back, as on iOS: a touch that starts at the left edge and travels right
 * goes back. Pure geometry, so the decision can be tested without a browser.
 */

/** Touches must start this close to the left edge (CSS px). */
export const SWIPE_BACK_EDGE = 24
/** Distance that commits the swipe on release. */
export const SWIPE_BACK_DISTANCE = 96
/** A shorter, quick flick also commits (px per ms). */
export const SWIPE_BACK_FLICK_SPEED = 0.5
const FLICK_MIN_DISTANCE = 40
/** Movement before the gesture decides between horizontal and vertical. */
const DECIDE_AFTER = 10

export type SwipePoint = { x: number; y: number; time: number }

export type SwipeState = 'tracking' | 'swiping' | 'cancelled'

export function startsAtEdge(point: Pick<SwipePoint, 'x'>): boolean {
  return point.x <= SWIPE_BACK_EDGE
}

/** Whether the finger is still a candidate, already swiping back, or scrolling instead. */
export function classifySwipe(start: SwipePoint, current: SwipePoint, state: SwipeState): SwipeState {
  if (state !== 'tracking') return state
  const dx = current.x - start.x
  const dy = Math.abs(current.y - start.y)
  if (Math.max(Math.abs(dx), dy) < DECIDE_AFTER) return 'tracking'
  return dx > 0 && dy < dx ? 'swiping' : 'cancelled'
}

/** 0 at the edge, 1 once the swipe would commit; drives the arrow indicator. */
export function swipeProgress(start: SwipePoint, current: SwipePoint): number {
  return Math.min(Math.max((current.x - start.x) / SWIPE_BACK_DISTANCE, 0), 1)
}

/** On release: far enough, or a quick flick. */
export function commitsSwipe(start: SwipePoint, end: SwipePoint): boolean {
  const dx = end.x - start.x
  if (dx >= SWIPE_BACK_DISTANCE) return true
  const elapsed = Math.max(end.time - start.time, 1)
  return dx >= FLICK_MIN_DISTANCE && dx / elapsed >= SWIPE_BACK_FLICK_SPEED
}
