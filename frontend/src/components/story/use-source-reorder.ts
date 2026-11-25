import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { clampIndex, dropIndexFromCentres } from './story-source-reorder'

export interface SourceLift {
  index: number
  target: number
  mode: 'pointer' | 'keyboard'
}

interface Options {
  /** Number of reorderable saved assets. */
  count: number
  enabled: boolean
  /** The list element whose `[data-source-index]` rows are measured for pointer drops. */
  listRef: RefObject<HTMLElement | null>
  /** Changes whenever the saved order changes; a keyboard drop waits for it to restore focus. */
  orderKey: string
  onMove: (from: number, to: number) => void
}

/**
 * Pointer and keyboard reordering. Pointer drags listen on the window so the
 * lifted row can move in the DOM without losing the drag. Keyboard: Space lifts,
 * arrows move, Space drops, Escape cancels.
 */
export function useSourceReorder({ count, enabled, listRef, orderKey, onMove }: Options) {
  const [lift, setLiftState] = useState<SourceLift | null>(null)
  const current = useRef<SourceLift | null>(null)
  const pointerDrag = useRef<{ pointerId: number; centres: number[] } | null>(null)
  const moveRef = useRef(onMove)
  /** Position the keyboard-dropped row will occupy once the saved order has updated. */
  const pendingFocusIndex = useRef<number | null>(null)

  useEffect(() => {
    moveRef.current = onMove
  })

  const setLift = useCallback((next: SourceLift | null) => {
    current.current = next
    setLiftState(next)
  }, [])

  const finish = useCallback(
    (commit: boolean) => {
      const active = current.current
      pointerDrag.current = null
      setLift(null)
      if (commit && active && active.target !== active.index) {
        if (active.mode === 'keyboard') pendingFocusIndex.current = active.target
        moveRef.current(active.index, active.target)
      }
    },
    [setLift]
  )

  // The reordered row is re-inserted in the DOM, which drops focus. Put it back on its grip.
  useEffect(() => {
    const target = pendingFocusIndex.current
    if (target === null) return
    const grip = listRef.current?.querySelector<HTMLElement>(
      `[data-source-index="${target}"] [data-source-grip]`
    )
    if (grip) {
      pendingFocusIndex.current = null
      grip.focus()
    }
  }, [orderKey, listRef])

  const moveTo = useCallback(
    (target: number) => {
      const active = current.current
      if (active && active.target !== target) setLift({ ...active, target })
    },
    [setLift]
  )

  const startPointer = useCallback(
    (event: PointerEvent<HTMLElement>, index: number) => {
      if (!enabled || event.button !== 0 || current.current) return
      event.preventDefault()
      const centres = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[data-source-index]') ?? []
      )
        .map((row) => {
          const box = row.getBoundingClientRect()
          return { index: Number(row.dataset.sourceIndex), centre: box.top + box.height / 2 }
        })
        .filter((row) => row.index !== index)
        .sort((a, b) => a.index - b.index)
        .map((row) => row.centre)
      pointerDrag.current = { pointerId: event.pointerId, centres }
      setLift({ index, target: index, mode: 'pointer' })
    },
    [enabled, listRef, setLift]
  )

  useEffect(() => {
    if (lift?.mode !== 'pointer') return
    const onMoveEvent = (event: globalThis.PointerEvent) => {
      const drag = pointerDrag.current
      if (!drag || event.pointerId !== drag.pointerId) return
      moveTo(dropIndexFromCentres(drag.centres, event.clientY))
    }
    const onEnd = (event: globalThis.PointerEvent, commit: boolean) => {
      if (event.pointerId === pointerDrag.current?.pointerId) finish(commit)
    }
    const onUp = (event: globalThis.PointerEvent) => onEnd(event, true)
    const onCancel = (event: globalThis.PointerEvent) => onEnd(event, false)
    window.addEventListener('pointermove', onMoveEvent)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMoveEvent)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [lift?.mode, finish, moveTo])

  useEffect(() => {
    if (lift?.mode !== 'keyboard') return
    // The lifted row moves in the DOM, which drops focus; keep it on the grip.
    const grip = listRef.current?.querySelector<HTMLElement>('[data-lifted="true"] [data-source-grip]')
    if (grip && document.activeElement !== grip) grip.focus()
  }, [lift?.mode, lift?.target, listRef])

  useEffect(() => {
    if (!enabled && current.current) finish(false)
  }, [enabled, finish])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, index: number) => {
      if (!enabled) return
      const active = current.current
      if (!active) {
        if (event.key !== ' ') return
        event.preventDefault()
        setLift({ index, target: index, mode: 'keyboard' })
        return
      }
      if (active.mode !== 'keyboard' || active.index !== index) return
      switch (event.key) {
        case ' ':
          event.preventDefault()
          finish(true)
          break
        case 'Escape':
          event.preventDefault()
          finish(false)
          break
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault()
          moveTo(clampIndex(active.target - 1, count))
          break
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault()
          moveTo(clampIndex(active.target + 1, count))
          break
      }
    },
    [count, enabled, finish, moveTo, setLift]
  )

  return {
    lift,
    /** Handlers for the drag grip of the saved asset at `index`. */
    gripHandlers: (index: number) => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => startPointer(event, index),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => onKeyDown(event, index)
    })
  }
}
