'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Play, Pause } from 'lucide-react'
import type { Segment } from './use-editor-state'

interface SegmentPlayerProps {
  sourceUrl: string
  segments: Segment[]
  onTimeUpdate?: (currentTime: number) => void
  seekTo?: number
}

export function SegmentPlayer({ sourceUrl, segments, onTimeUpdate, seekTo }: SegmentPlayerProps) {
  const t = useTranslations('editor')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [segmentMode, setSegmentMode] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const currentSegmentRef = useRef(0)

  // Sort segments by order for playback
  const sortedSegments = [...segments].sort((a, b) => a.order - b.order)

  // Handle seekTo prop from parent (timeline click)
  useEffect(() => {
    if (seekTo !== undefined && videoRef.current) {
      videoRef.current.currentTime = seekTo
    }
  }, [seekTo])

  // Segment-mode playback: skip between segments
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    onTimeUpdate?.(video.currentTime)

    if (!segmentMode || sortedSegments.length === 0) return

    const currentIdx = currentSegmentRef.current
    const seg = sortedSegments[currentIdx]
    if (!seg) return

    if (video.currentTime >= seg.end) {
      const nextIdx = currentIdx + 1
      if (nextIdx < sortedSegments.length) {
        currentSegmentRef.current = nextIdx
        video.currentTime = sortedSegments[nextIdx].start
      } else {
        video.pause()
        setIsPlaying(false)
        currentSegmentRef.current = 0
      }
    }
  }, [segmentMode, sortedSegments, onTimeUpdate])

  const handlePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (segmentMode && sortedSegments.length > 0) {
      currentSegmentRef.current = 0
      video.currentTime = sortedSegments[0].start
    }
    video.play()
    setIsPlaying(true)
  }, [segmentMode, sortedSegments])

  const handlePause = useCallback(() => {
    videoRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const toggleMode = useCallback(() => {
    setSegmentMode(prev => !prev)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-video rounded-lg bg-black overflow-hidden">
        <video
          ref={videoRef}
          src={sourceUrl}
          className="h-full w-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          controls
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={isPlaying ? handlePause : handlePlay}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {segmentMode ? t('playSegments') : t('playAll')}
        </button>
        <button
          type="button"
          onClick={toggleMode}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {segmentMode ? t('playAll') : t('playSegments')}
        </button>
      </div>
    </div>
  )
}
