'use client'

import { classifySwipe, commitsSwipe, startsAtEdge, swipeProgress, type SwipePoint, type SwipeState } from '@/lib/swipe-back'
import { useEffect, useRef } from 'react'
import { create } from 'zustand'

/** How far the current edge swipe has travelled, for the arrow indicator. */
export const useSwipeBackProgress = create<{ progress: number; active: boolean }>(() => ({ progress: 0, active: false }))

type Handler = { current: () => void }

/** Pages register their back action; the most recently mounted one wins. */
const handlers: Handler[] = []
let detachListeners: (() => void) | null = null

const OPEN_OVERLAY = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

function toPoint(touch: Touch): SwipePoint {
  return { x: touch.clientX, y: touch.clientY, time: performance.now() }
}

function attachListeners() {
  let start: SwipePoint | null = null
  let last: SwipePoint | null = null
  let state: SwipeState = 'cancelled'

  const reset = () => {
    start = last = null
    state = 'cancelled'
    useSwipeBackProgress.setState({ progress: 0, active: false })
  }
  const onStart = (event: TouchEvent) => {
    // An open sheet or dialog owns the screen; going back underneath it would be surprising.
    if (event.touches.length !== 1 || handlers.length === 0 || document.querySelector(OPEN_OVERLAY)) return
    const point = toPoint(event.touches[0])
    if (!startsAtEdge(point)) return
    start = last = point
    state = 'tracking'
  }
  const onMove = (event: TouchEvent) => {
    if (!start || state === 'cancelled') return
    last = toPoint(event.touches[0])
    state = classifySwipe(start, last, state)
    if (state === 'swiping') useSwipeBackProgress.setState({ progress: swipeProgress(start, last), active: true })
    else if (state === 'cancelled') reset()
  }
  const onEnd = (event: TouchEvent) => {
    const end = event.changedTouches[0] ? toPoint(event.changedTouches[0]) : last
    const commit = Boolean(start && end && state === 'swiping' && commitsSwipe(start, end))
    reset()
    if (commit) handlers[handlers.length - 1]?.current()
  }

  // Passive listeners never block scrolling. When Safari's own back swipe takes over,
  // the page receives touchcancel, so the two never both navigate.
  document.addEventListener('touchstart', onStart, { passive: true })
  document.addEventListener('touchmove', onMove, { passive: true })
  document.addEventListener('touchend', onEnd, { passive: true })
  document.addEventListener('touchcancel', reset, { passive: true })
  return () => {
    document.removeEventListener('touchstart', onStart)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
    document.removeEventListener('touchcancel', reset)
    reset()
  }
}

/**
 * Swiping right from the left screen edge runs the same action as the page's back button.
 * Pass `enabled = false` while the back button is hidden or disabled.
 */
export function useSwipeBack(onBack: () => void, enabled = true) {
  const handler = useRef(onBack)
  useEffect(() => {
    handler.current = onBack
  }, [onBack])

  useEffect(() => {
    if (!enabled) return
    const entry = handler
    handlers.push(entry)
    detachListeners ??= attachListeners()
    return () => {
      const index = handlers.lastIndexOf(entry)
      if (index >= 0) handlers.splice(index, 1)
      if (handlers.length === 0 && detachListeners) {
        detachListeners()
        detachListeners = null
      }
    }
  }, [enabled])
}
