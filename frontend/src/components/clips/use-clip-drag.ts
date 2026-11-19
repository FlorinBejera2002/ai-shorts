'use client'

import type { LibraryClip } from '@/lib/clips-library'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** Elements that accept a dropped clip carry `data-clips-drop="<project id>"`. */
export const DROP_ATTRIBUTE = 'data-clips-drop'

const MOUSE_THRESHOLD = 6
const TOUCH_HOLD_MS = 350
const TOUCH_SLOP = 8

type Pending = { clip: LibraryClip; x: number; y: number; touch: boolean; timer?: number }
export type ClipDrag = { clip: LibraryClip; targetId: string | null }

function targetAt(x: number, y: number) {
  const element = document.elementFromPoint(x, y)?.closest(`[${DROP_ATTRIBUTE}]`)
  return element?.getAttribute(DROP_ATTRIBUTE) || null
}

/**
 * Drags a clip onto a project. Mouse drags start after a few pixels; touch drags start after a
 * long press so ordinary scrolling keeps working. The ghost follows the pointer through `ghostRef`.
 */
export function useClipDrag(onDrop: (clip: LibraryClip, projectId: string) => void) {
  const [drag, setDrag] = useState<ClipDrag | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const pending = useRef<Pending | null>(null)
  const active = useRef<ClipDrag | null>(null)
  const dropRef = useRef(onDrop)
  useEffect(() => {
    dropRef.current = onDrop
  }, [onDrop])

  const place = useCallback((x: number, y: number) => {
    if (ghostRef.current) ghostRef.current.style.transform = `translate(${x - 36}px, ${y - 100}px)`
  }, [])

  const stop = useCallback(() => {
    if (pending.current?.timer) window.clearTimeout(pending.current.timer)
    pending.current = null
    active.current = null
    setDrag(null)
  }, [])

  const begin = useCallback(
    (x: number, y: number) => {
      if (!pending.current) return
      active.current = { clip: pending.current.clip, targetId: targetAt(x, y) }
      setDrag(active.current)
      requestAnimationFrame(() => place(x, y))
    },
    [place]
  )

  useEffect(() => {
    function move(event: PointerEvent) {
      const start = pending.current
      if (!start) return
      if (!active.current) {
        const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
        if (start.touch) {
          if (distance > TOUCH_SLOP) stop()
          return
        }
        if (distance < MOUSE_THRESHOLD) return
        begin(event.clientX, event.clientY)
      }
      place(event.clientX, event.clientY)
      const targetId = targetAt(event.clientX, event.clientY)
      if (active.current && targetId !== active.current.targetId) {
        active.current = { ...active.current, targetId }
        setDrag(active.current)
      }
    }
    function up(event: PointerEvent) {
      const current = active.current
      if (current) {
        swallowNextClick()
        const targetId = targetAt(event.clientX, event.clientY)
        if (targetId) dropRef.current(current.clip, targetId)
      }
      stop()
    }
    function blockScroll(event: TouchEvent) {
      if (active.current) event.preventDefault()
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape' && active.current) stop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('touchmove', blockScroll, { passive: false })
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('touchmove', blockScroll)
      window.removeEventListener('keydown', key)
    }
  }, [begin, place, stop])

  const start = useCallback(
    (clip: LibraryClip, event: ReactPointerEvent) => {
      const target = event.target as Element
      // Portaled menus bubble React events through the card; only the card itself starts a drag.
      if (event.button !== 0 || !event.currentTarget.contains(target) || target.closest('button')) return
      const touch = event.pointerType !== 'mouse'
      pending.current = { clip, x: event.clientX, y: event.clientY, touch }
      if (touch) {
        const { clientX, clientY } = event
        pending.current.timer = window.setTimeout(() => begin(clientX, clientY), TOUCH_HOLD_MS)
      }
    },
    [begin]
  )

  return { drag, ghostRef, start }
}

function swallow(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
}

/** The pointer was released over a card or link: cancel the click that release would trigger. */
function swallowNextClick() {
  window.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}
