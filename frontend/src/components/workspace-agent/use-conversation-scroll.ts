import { useCallback, useRef, useState } from 'react'

/** Follow new output only while the reader is near the end of the conversation. */
export function useConversationScroll() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const following = useRef(true)
  const lastScrollTop = useRef(0)
  const historyAnchor = useRef<{ height: number; top: number } | null>(null)
  const [awayFromBottom, setAwayFromBottom] = useState(false)

  const onScroll = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || !viewport.clientHeight) return
    const nearEnd = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 64
    // Only a scroll towards older messages stops following. Content and layout changes
    // (a new run, the composer resizing, a sheet opening) can fire scroll events while the
    // viewport has not caught up yet; they must not detach the reader from the latest output.
    const scrolledUp = viewport.scrollTop < lastScrollTop.current
    lastScrollTop.current = viewport.scrollTop
    if (nearEnd) following.current = true
    else if (scrolledUp) following.current = false
    setAwayFromBottom(!following.current)
  }, [])

  const scrollToLatest = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    following.current = true
    historyAnchor.current = null
    setAwayFromBottom(false)
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'instant' })
    lastScrollTop.current = viewport.scrollTop
  }, [])

  const preserveHistoryPosition = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    following.current = false
    historyAnchor.current = { height: viewport.scrollHeight, top: viewport.scrollTop }
  }, [])

  const attachViewport = useCallback((viewport: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    viewportRef.current = viewport
    if (!viewport) return
    if (following.current) lastScrollTop.current = viewport.scrollTop
    else viewport.scrollTop = lastScrollTop.current
    const observer = new ResizeObserver(() => {
      if (!viewport.clientHeight) return
      const anchor = historyAnchor.current
      if (anchor && viewport.scrollHeight !== anchor.height) {
        viewport.scrollTop = anchor.top + viewport.scrollHeight - anchor.height
        lastScrollTop.current = viewport.scrollTop
        historyAnchor.current = null
      } else if (following.current) {
        // ResizeObserver already follows each committed change; no synthetic streaming.
        viewport.scrollTop = viewport.scrollHeight
        lastScrollTop.current = viewport.scrollTop
      }
    })
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
    observer.observe(viewport)
    observerRef.current = observer
  }, [])

  return { viewportRef: attachViewport, onScroll, awayFromBottom, scrollToLatest, preserveHistoryPosition }
}
