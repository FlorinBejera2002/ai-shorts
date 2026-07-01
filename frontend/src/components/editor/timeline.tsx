'use client'

import { useRef, useState, useCallback } from 'react'
import type { Segment } from './use-editor-state'

interface TimelineProps {
  duration: number           // source video total duration
  segments: Segment[]
  selectedIndex: number | null
  currentTime: number        // playhead position
  onResize: (index: number, start: number, end: number) => void
  onMove: (index: number, start: number, end: number) => void
  onSelect: (index: number | null) => void
  onAddAt: (time: number) => void
  onSeek: (time: number) => void
}

type DragMode = null | { type: 'resize-left' | 'resize-right' | 'move'; index: number; startX: number; origStart: number; origEnd: number }

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

export function Timeline({
  duration,
  segments,
  selectedIndex,
  currentTime,
  onResize,
  onMove,
  onSelect,
  onAddAt,
  onSeek,
}: TimelineProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragMode>(null)

  const timeToPercent = useCallback((t: number) => (t / duration) * 100, [duration])
  const pixelsToTime = useCallback(
    (px: number) => {
      const bar = barRef.current
      if (!bar) return 0
      return (px / bar.clientWidth) * duration
    },
    [duration]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number, mode: 'resize-left' | 'resize-right' | 'move') => {
      e.preventDefault()
      e.stopPropagation()
      const seg = segments[index]
      setDrag({ type: mode, index, startX: e.clientX, origStart: seg.start, origEnd: seg.end })
      onSelect(index)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [segments, onSelect]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      const deltaTime = pixelsToTime(e.clientX - drag.startX)
      const { index, origStart, origEnd } = drag

      if (drag.type === 'move') {
        let newStart = origStart + deltaTime
        let newEnd = origEnd + deltaTime
        if (newStart < 0) {
          newEnd -= newStart
          newStart = 0
        }
        if (newEnd > duration) {
          newStart -= newEnd - duration
          newEnd = duration
        }
        onMove(index, Math.max(0, newStart), Math.min(duration, newEnd))
      } else if (drag.type === 'resize-left') {
        const newStart = Math.max(0, Math.min(origEnd - 0.25, origStart + deltaTime))
        onResize(index, newStart, origEnd)
      } else if (drag.type === 'resize-right') {
        const newEnd = Math.min(duration, Math.max(origStart + 0.25, origEnd + deltaTime))
        onResize(index, origStart, newEnd)
      }
    },
    [drag, duration, pixelsToTime, onMove, onResize]
  )

  const handlePointerUp = useCallback(() => {
    setDrag(null)
  }, [])

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if (drag) return
      const bar = barRef.current
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      const time = ((e.clientX - rect.left) / rect.width) * duration
      // Check if click is on empty space
      const isOnSegment = segments.some(s => time >= s.start && time <= s.end)
      if (isOnSegment) return
      onSeek(time)
    },
    [drag, duration, segments, onSeek]
  )

  const handleBarDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const bar = barRef.current
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      const time = ((e.clientX - rect.left) / rect.width) * duration
      const isOnSegment = segments.some(s => time >= s.start && time <= s.end)
      if (!isOnSegment) {
        onAddAt(time)
      }
    },
    [duration, segments, onAddAt]
  )

  // Tick marks
  const tickCount = Math.min(20, Math.floor(duration / 5))
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (i / tickCount) * duration)

  return (
    <div className="flex flex-col gap-1">
      {/* Tick labels */}
      <div className="relative h-4 text-[10px] text-muted-foreground">
        {ticks.map(t => (
          <span
            key={t}
            className="absolute -translate-x-1/2"
            style={{ left: `${timeToPercent(t)}%` }}
          >
            {formatTimestamp(t)}
          </span>
        ))}
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        className="relative h-14 cursor-crosshair rounded-md bg-muted"
        onClick={handleBarClick}
        onDoubleClick={handleBarDoubleClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Segments */}
        {segments.map((seg, i) => {
          const left = timeToPercent(seg.start)
          const width = timeToPercent(seg.end - seg.start)
          const isSelected = selectedIndex === i

          return (
            <div
              key={i}
              className={`absolute top-1 bottom-1 rounded ${isSelected ? 'bg-primary/60 ring-2 ring-primary' : 'bg-primary/30'}`}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              {/* Left handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize rounded-l bg-primary hover:bg-primary/80"
                onPointerDown={e => handlePointerDown(e, i, 'resize-left')}
              />
              {/* Body (drag to move) */}
              <div
                className="absolute inset-0 mx-1.5 cursor-grab active:cursor-grabbing"
                onPointerDown={e => handlePointerDown(e, i, 'move')}
              />
              {/* Right handle */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize rounded-r bg-primary hover:bg-primary/80"
                onPointerDown={e => handlePointerDown(e, i, 'resize-right')}
              />
            </div>
          )
        })}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-red-500"
          style={{ left: `${timeToPercent(currentTime)}%` }}
        />
      </div>
    </div>
  )
}
