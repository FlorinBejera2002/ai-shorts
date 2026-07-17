'use client'

import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'

import type { Segment } from './use-editor-state'
import { useFilmstrip } from './use-filmstrip'

export const MIN_ZOOM = 1
export const MAX_ZOOM = 10

const SNAP_THRESHOLD_PX = 8
const TICK_MIN_SPACING_PX = 72
const TICK_INTERVALS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

interface TimelineProps {
  duration: number
  sourceUrl: string
  segments: Segment[]
  selectedIndex: number | null
  activeIndex: number | null
  currentTime: number
  isPlaying: boolean
  zoom: number
  onZoomChange: (zoom: number) => void
  onBeginDrag: () => void
  onResize: (index: number, start: number, end: number) => void
  onMove: (index: number, start: number, end: number) => void
  onSelect: (index: number | null) => void
  onAddAt: (time: number) => void
  onSeek: (time: number) => void
}

type DragMode = null | {
  type: 'resize-left' | 'resize-right' | 'move'
  index: number
  startX: number
  origStart: number
  origEnd: number
  snapTargets: number[]
}

function formatTimestamp(seconds: number, precise: boolean): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (precise) return `${m}:${s.toFixed(1).padStart(4, '0')}`
  return `${m}:${String(Math.round(s)).padStart(2, '0')}`
}

export function Timeline({
  duration,
  sourceUrl,
  segments,
  selectedIndex,
  activeIndex,
  currentTime,
  isPlaying,
  zoom,
  onZoomChange,
  onBeginDrag,
  onResize,
  onMove,
  onSelect,
  onAddAt,
  onSeek
}: TimelineProps) {
  const t = useTranslations('editor')
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [drag, setDrag] = useState<DragMode>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const pendingScroll = useRef<{ time: number; offset: number } | null>(null)
  const frames = useFilmstrip(sourceUrl, duration)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    observer.observe(el)
    setContainerWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const pps = duration > 0 && containerWidth > 0
    ? (containerWidth / duration) * zoom
    : 0
  const innerWidth = duration * pps

  const xToTime = useCallback(
    (clientX: number) => {
      const content = contentRef.current
      if (!content || pps === 0) return 0
      const rect = content.getBoundingClientRect()
      return Math.min(duration, Math.max(0, (clientX - rect.left) / pps))
    },
    [pps, duration]
  )

  // Apply scroll compensation after a cursor-anchored zoom change
  useLayoutEffect(() => {
    const pending = pendingScroll.current
    const el = scrollRef.current
    if (pending && el && pps > 0) {
      el.scrollLeft = pending.time * pps - pending.offset
      pendingScroll.current = null
    }
  }, [pps])

  // Ctrl+wheel zoom anchored at the cursor (native listener: React's is passive)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.25 : 0.8
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
      if (next === zoom) return
      const rect = el.getBoundingClientRect()
      const offset = e.clientX - rect.left
      pendingScroll.current = {
        time: (el.scrollLeft + offset) / (pps || 1),
        offset
      }
      onZoomChange(next)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [zoom, pps, onZoomChange])

  // Keep the playhead visible while playing
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isPlaying || pps === 0) return
    const x = currentTime * pps
    if (x < el.scrollLeft + 24 || x > el.scrollLeft + el.clientWidth - 24) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2)
    }
  }, [currentTime, isPlaying, pps])

  const buildSnapTargets = useCallback(
    (excludeIndex: number) => {
      const targets = [0, duration, currentTime]
      segments.forEach((s, i) => {
        if (i !== excludeIndex) targets.push(s.start, s.end)
      })
      return targets
    },
    [segments, duration, currentTime]
  )

  const snap = useCallback(
    (time: number, targets: number[]) => {
      if (pps === 0) return time
      const threshold = SNAP_THRESHOLD_PX / pps
      let best = time
      let bestDist = threshold
      for (const target of targets) {
        const dist = Math.abs(target - time)
        if (dist < bestDist) {
          best = target
          bestDist = dist
        }
      }
      return best
    },
    [pps]
  )

  const handlePointerDown = useCallback(
    (
      e: React.PointerEvent,
      index: number,
      mode: 'resize-left' | 'resize-right' | 'move'
    ) => {
      e.preventDefault()
      e.stopPropagation()
      const seg = segments[index]
      if (!seg) return
      onBeginDrag()
      setDrag({
        type: mode,
        index,
        startX: e.clientX,
        origStart: seg.start,
        origEnd: seg.end,
        snapTargets: buildSnapTargets(index)
      })
      onSelect(index)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [segments, onSelect, onBeginDrag, buildSnapTargets]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || pps === 0) return
      const deltaTime = (e.clientX - drag.startX) / pps
      const { index, origStart, origEnd, snapTargets } = drag

      if (drag.type === 'move') {
        const length = origEnd - origStart
        let newStart = origStart + deltaTime
        // Snap whichever edge is closer to a target
        const snappedStart = snap(newStart, snapTargets)
        const snappedEnd = snap(newStart + length, snapTargets)
        if (snappedStart !== newStart) {
          newStart = snappedStart
        } else if (snappedEnd !== newStart + length) {
          newStart = snappedEnd - length
        }
        newStart = Math.min(Math.max(0, newStart), duration - length)
        onMove(index, newStart, newStart + length)
      } else if (drag.type === 'resize-left') {
        const raw = snap(origStart + deltaTime, snapTargets)
        const newStart = Math.max(0, Math.min(origEnd - 0.25, raw))
        onResize(index, newStart, origEnd)
      } else {
        const raw = snap(origEnd + deltaTime, snapTargets)
        const newEnd = Math.min(duration, Math.max(origStart + 0.25, raw))
        onResize(index, origStart, newEnd)
      }
    },
    [drag, pps, duration, snap, onMove, onResize]
  )

  const handlePointerUp = useCallback(() => setDrag(null), [])

  const handleRulerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      setScrubbing(true)
      onSeek(xToTime(e.clientX))
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [onSeek, xToTime]
  )

  const handleRulerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (scrubbing) onSeek(xToTime(e.clientX))
    },
    [scrubbing, onSeek, xToTime]
  )

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (drag) return
      const time = xToTime(e.clientX)
      const isOnSegment = segments.some(
        (s) => time >= s.start && time <= s.end
      )
      if (isOnSegment) return
      onSelect(null)
      onSeek(time)
    },
    [drag, xToTime, segments, onSelect, onSeek]
  )

  const handleTrackDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const time = xToTime(e.clientX)
      const isOnSegment = segments.some(
        (s) => time >= s.start && time <= s.end
      )
      if (!isOnSegment) onAddAt(time)
    },
    [xToTime, segments, onAddAt]
  )

  const zoomBy = useCallback(
    (factor: number) => {
      const el = scrollRef.current
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
      if (next === zoom || !el) {
        onZoomChange(next)
        return
      }
      const offset = el.clientWidth / 2
      pendingScroll.current = {
        time: (el.scrollLeft + offset) / (pps || 1),
        offset
      }
      onZoomChange(next)
    },
    [zoom, pps, onZoomChange]
  )

  // Ruler ticks
  const tickInterval =
    TICK_INTERVALS.find((i) => i * pps >= TICK_MIN_SPACING_PX) ??
    TICK_INTERVALS[TICK_INTERVALS.length - 1]!
  const tickCount = pps > 0 ? Math.floor(duration / tickInterval) : 0
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickInterval)
  const preciseTicks = tickInterval < 1

  if (duration <= 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card text-xs text-muted-foreground">
        {t('loadingTimeline')}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t('timelineHint')}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(0.8)}
            disabled={zoom <= MIN_ZOOM}
            title={t('zoomOut')}
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ZoomOut className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <span className="min-w-12 text-center text-[11px] font-medium tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            disabled={zoom >= MAX_ZOOM}
            title={t('zoomIn')}
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(MIN_ZOOM)}
            disabled={zoom === MIN_ZOOM}
            title={t('zoomFit')}
            className="ml-1 rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div
          ref={contentRef}
          className="relative"
          style={{ width: innerWidth > 0 ? `${innerWidth}px` : '100%' }}
        >
          {/* Ruler */}
          <div
            role="slider"
            aria-label={t('scrubber')}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={-1}
            className="relative h-6 cursor-ew-resize select-none border-b border-border/60"
            onPointerDown={handleRulerPointerDown}
            onPointerMove={handleRulerPointerMove}
            onPointerUp={() => setScrubbing(false)}
            onPointerCancel={() => setScrubbing(false)}
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="pointer-events-none absolute bottom-0 flex h-3 items-start border-l border-border pl-1 text-[9px] leading-none text-muted-foreground"
                style={{ left: `${tick * pps}px` }}
              >
                {formatTimestamp(tick, preciseTicks)}
              </span>
            ))}
          </div>

          {/* Track */}
          <div
            className="relative h-16 cursor-crosshair rounded-b-md bg-muted"
            onClick={handleTrackClick}
            onDoubleClick={handleTrackDoubleClick}
            onPointerMove={(e) => {
              handlePointerMove(e)
              if (!drag) setHoverTime(xToTime(e.clientX))
            }}
            onPointerLeave={() => setHoverTime(null)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Filmstrip */}
            {frames.length > 0 && (
              <div className="pointer-events-none absolute inset-0 flex overflow-hidden rounded-b-md opacity-50 dark:opacity-40">
                {frames.map((frame, i) => (
                  <img
                    key={i}
                    src={frame}
                    alt=""
                    draggable={false}
                    className="h-full object-cover"
                    style={{ width: `${100 / frames.length}%` }}
                  />
                ))}
              </div>
            )}

            {/* Segments */}
            {segments.map((seg, i) => {
              const left = seg.start * pps
              const width = (seg.end - seg.start) * pps
              const isSelected = selectedIndex === i
              const isActive = activeIndex === i
              return (
                <div
                  key={i}
                  className={`absolute bottom-1 top-1 rounded-md border transition-shadow ${
                    isSelected
                      ? 'border-primary bg-primary/50 ring-2 ring-primary shadow-lg shadow-primary/20'
                      : isActive
                        ? 'border-primary/70 bg-primary/40'
                        : 'border-primary/40 bg-primary/25 hover:bg-primary/35'
                  }`}
                  style={{ left: `${left}px`, width: `${width}px` }}
                >
                  {width > 56 && (
                    <span className="pointer-events-none absolute left-2 top-1 max-w-full truncate text-[10px] font-semibold text-foreground/90">
                      #{i + 1} · {(seg.end - seg.start).toFixed(1)}s
                    </span>
                  )}
                  <div
                    className="absolute bottom-0 left-0 top-0 w-2 cursor-col-resize rounded-l-md bg-primary/80 transition-colors hover:bg-primary"
                    onPointerDown={(e) => handlePointerDown(e, i, 'resize-left')}
                  />
                  <div
                    className="absolute inset-y-0 left-2 right-2 cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => handlePointerDown(e, i, 'move')}
                  />
                  <div
                    className="absolute bottom-0 right-0 top-0 w-2 cursor-col-resize rounded-r-md bg-primary/80 transition-colors hover:bg-primary"
                    onPointerDown={(e) => handlePointerDown(e, i, 'resize-right')}
                  />
                </div>
              )
            })}

            {/* Hover time tooltip */}
            {hoverTime !== null && !drag && !scrubbing && (
              <div
                className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-background shadow"
                style={{ left: `${hoverTime * pps}px` }}
              >
                {formatTimestamp(hoverTime, true)}
              </div>
            )}
          </div>

          {/* Playhead (spans ruler + track) */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-red-500"
            style={{ left: `${currentTime * pps}px` }}
          >
            <span className="absolute -left-[5px] top-0 h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-red-500" />
          </div>
        </div>
      </div>
    </div>
  )
}
