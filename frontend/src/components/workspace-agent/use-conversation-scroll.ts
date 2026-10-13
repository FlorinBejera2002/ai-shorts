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
    lastScrollTop.current = viewport.scrollTop
    following.current = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 64
    setAwayFromBottom(!following.current)
  }, [])

  const scrollToLatest = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    following.current = true
    historyAnchor.current = null
    setAwayFromBottom(false)
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'instant' })
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
    if (!following.current) viewport.scrollTop = lastScrollTop.current
    const observer = new ResizeObserver(() => {
      if (!viewport.clientHeight) return
      const anchor = historyAnchor.current
      if (anchor && viewport.scrollHeight !== anchor.height) {
        viewport.scrollTop = anchor.top + viewport.scrollHeight - anchor.height
        historyAnchor.current = null
      } else if (following.current) {
        // ResizeObserver already follows each committed change; no synthetic streaming.
        viewport.scrollTop = viewport.scrollHeight
      }
    })
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
    observer.observe(viewport)
    observerRef.current = observer
  }, [])

  return { viewportRef: attachViewport, onScroll, awayFromBottom, scrollToLatest, preserveHistoryPosition }
}
