'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'sneepcut.agent.bubbleAt'
const IDLE_MS = 45_000
const DAY_MS = 24 * 60 * 60 * 1000
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown'] as const

/** Timestamp of the last time the bubble was shown, dismissed or the agent opened. Storage can be blocked, so reads never throw. */
function readLastBubbleAt(): number | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    const parsed = value === null ? NaN : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeLastBubbleAt(timestamp: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(timestamp))
  } catch {
    // Without storage the bubble simply shows again on the next visit.
  }
}

function isBubbleDue(lastBubbleAt: number | null): boolean {
  return lastBubbleAt === null || Date.now() - lastBubbleAt >= DAY_MS
}

/**
 * Speech-bubble state for the launcher. It appears on the first visit, then again after about 45s
 * without pointer or keyboard activity, at most once a day. Showing, dismissing or opening the agent
 * records the timestamp, and the bubble never shows while the panel is open.
 */
export function useAgentBubble(panelOpen: boolean) {
  const [visible, setVisible] = useState(false)

  const show = useCallback(() => {
    writeLastBubbleAt(Date.now())
    setVisible(true)
  }, [])

  const hide = useCallback(() => {
    writeLastBubbleAt(Date.now())
    setVisible(false)
  }, [])

  // First visit: nothing recorded yet, so the bubble appears straight away.
  useEffect(() => {
    if (readLastBubbleAt() === null) show()
  }, [show])

  // Idle re-show: restart the countdown on every pointer or keyboard event.
  useEffect(() => {
    if (panelOpen || visible || !isBubbleDue(readLastBubbleAt())) return
    let timer = window.setTimeout(show, IDLE_MS)
    const restart = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(show, IDLE_MS)
    }
    ACTIVITY_EVENTS.forEach(name => window.addEventListener(name, restart, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, restart))
    }
  }, [panelOpen, visible, show])

  return { visible: visible && !panelOpen, hide }
}
