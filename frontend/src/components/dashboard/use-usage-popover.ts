import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'

/** Keeps hover details reachable without taking focus away from the trigger. */
export function useUsagePopover() {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const skipFocus = useRef(false)
  const focusedDetails = useRef(false)

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }
  function scheduleClose() {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      if (!trigger.current?.matches(':focus-visible') && !content.current?.contains(document.activeElement)) setOpen(false)
    }, 160)
  }
  function onPointerEnter(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    cancelClose()
    setOpen(true)
  }
  function onPointerLeave(event: PointerEvent) {
    if (event.pointerType === 'mouse') scheduleClose()
  }
  function onFocus(event: FocusEvent<HTMLButtonElement>) {
    if (skipFocus.current) { skipFocus.current = false; return }
    if (event.currentTarget.matches(':focus-visible')) setOpen(true)
  }
  function onCloseAutoFocus(event: Event) {
    event.preventDefault()
    if (focusedDetails.current && (content.current?.contains(document.activeElement) || document.activeElement === document.body)) {
      skipFocus.current = true
      trigger.current?.focus({ preventScroll: true })
    }
    focusedDetails.current = false
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  return {
    open, setOpen, trigger, content, onCloseAutoFocus,
    triggerEvents: { onPointerEnter, onPointerLeave, onFocus, onBlur: scheduleClose },
    contentEvents: {
      onPointerEnter: cancelClose, onPointerLeave: scheduleClose, onBlur: scheduleClose,
      onFocusCapture: () => { focusedDetails.current = true }
    }
  }
}
