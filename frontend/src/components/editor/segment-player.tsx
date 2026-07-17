'use client'

import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'

import type { Segment } from './use-editor-state'

const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.5]

export interface SegmentPlayerHandle {
  togglePlay: () => void
  seekTo: (time: number) => void
  seekBy: (delta: number) => void
  getCurrentTime: () => number
}

interface SegmentPlayerProps {
  sourceUrl: string
  segments: Segment[]
  onTimeUpdate?: (currentTime: number) => void
  onPlayingChange?: (playing: boolean) => void
  onActiveSegmentChange?: (index: number | null) => void
  onDurationChange?: (duration: number) => void
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export const SegmentPlayer = forwardRef<SegmentPlayerHandle, SegmentPlayerProps>(
  function SegmentPlayer(
    {
      sourceUrl,
      segments,
      onTimeUpdate,
      onPlayingChange,
      onActiveSegmentChange,
      onDurationChange
    },
    ref
  ) {
    const t = useTranslations('editor')
    const videoRef = useRef<HTMLVideoElement>(null)
    const [segmentMode, setSegmentMode] = useState(true)
    const [isPlaying, setIsPlaying] = useState(false)
    const [muted, setMuted] = useState(false)
    const [rateIndex, setRateIndex] = useState(0)
    const [clock, setClock] = useState({ current: 0, total: 0 })
    const activeIndexRef = useRef<number | null>(null)
    /** Index (in order) of the segment last played in segment mode. */
    const lastPlayedRef = useRef<number | null>(null)

    const sortedSegments = useMemo(
      () => [...segments].sort((a, b) => a.order - b.order),
      [segments]
    )
    const totalSegmentDuration = useMemo(
      () => sortedSegments.reduce((sum, s) => sum + (s.end - s.start), 0),
      [sortedSegments]
    )

    const reportActive = useCallback(
      (index: number | null) => {
        if (activeIndexRef.current !== index) {
          activeIndexRef.current = index
          onActiveSegmentChange?.(index)
        }
      },
      [onActiveSegmentChange]
    )

    /** Elapsed time counted only inside segments (for the segment-mode clock). */
    const elapsedInSegments = useCallback(
      (time: number) => {
        let elapsed = 0
        for (const seg of sortedSegments) {
          if (time >= seg.end) {
            elapsed += seg.end - seg.start
          } else if (time > seg.start) {
            elapsed += time - seg.start
          }
        }
        return elapsed
      },
      [sortedSegments]
    )

    const handleTimeUpdate = useCallback(() => {
      const video = videoRef.current
      if (!video) return
      const time = video.currentTime
      onTimeUpdate?.(time)

      const inside = sortedSegments.findIndex(
        (s) => time >= s.start && time < s.end
      )
      reportActive(inside === -1 ? null : inside)

      if (segmentMode) {
        setClock({
          current: Math.min(elapsedInSegments(time), totalSegmentDuration),
          total: totalSegmentDuration
        })
      } else {
        setClock({ current: time, total: video.duration || 0 })
      }

      if (!segmentMode || sortedSegments.length === 0 || video.paused) return

      // Segment-mode playback advances in segment ORDER (the order used at
      // export), which may jump backwards in source time.
      if (inside !== -1) {
        lastPlayedRef.current = inside
        return
      }
      const nextIndex =
        lastPlayedRef.current === null ? 0 : lastPlayedRef.current + 1
      const next = sortedSegments[nextIndex]
      if (next) {
        lastPlayedRef.current = nextIndex
        video.currentTime = next.start
      } else {
        video.pause()
        lastPlayedRef.current = null
        video.currentTime = sortedSegments[0]?.start ?? 0
      }
    }, [
      segmentMode,
      sortedSegments,
      onTimeUpdate,
      reportActive,
      elapsedInSegments,
      totalSegmentDuration
    ])

    const play = useCallback(() => {
      const video = videoRef.current
      if (!video) return
      if (segmentMode && sortedSegments.length > 0) {
        const time = video.currentTime
        const inside = sortedSegments.findIndex(
          (s) => time >= s.start && time < s.end
        )
        if (inside === -1) {
          lastPlayedRef.current = 0
          video.currentTime = sortedSegments[0]!.start
        } else {
          lastPlayedRef.current = inside
        }
      }
      void video.play()
    }, [segmentMode, sortedSegments])

    const togglePlay = useCallback(() => {
      const video = videoRef.current
      if (!video) return
      if (video.paused) {
        play()
      } else {
        video.pause()
      }
    }, [play])

    const seekTo = useCallback(
      (time: number) => {
        const video = videoRef.current
        if (!video) return
        video.currentTime = Math.max(0, Math.min(video.duration || time, time))
        const t = video.currentTime
        // Re-anchor segment-order playback around the new position
        const inside = sortedSegments.findIndex(
          (s) => t >= s.start && t < s.end
        )
        if (inside !== -1) {
          lastPlayedRef.current = inside
        } else {
          let upcoming = -1
          sortedSegments.forEach((s, i) => {
            if (
              s.start > t &&
              (upcoming === -1 || s.start < sortedSegments[upcoming]!.start)
            ) {
              upcoming = i
            }
          })
          lastPlayedRef.current =
            upcoming === -1 ? sortedSegments.length - 1 : upcoming - 1
        }
        onTimeUpdate?.(t)
      },
      [onTimeUpdate, sortedSegments]
    )

    const jumpToBoundary = useCallback(
      (direction: 'prev' | 'next') => {
        const video = videoRef.current
        if (!video || sortedSegments.length === 0) return
        const time = video.currentTime
        const boundaries = sortedSegments
          .flatMap((s) => [s.start, s.end])
          .sort((a, b) => a - b)
        if (direction === 'next') {
          const next = boundaries.find((b) => b > time + 0.05)
          if (next !== undefined) seekTo(next)
        } else {
          const prev = [...boundaries].reverse().find((b) => b < time - 0.05)
          seekTo(prev ?? 0)
        }
      },
      [sortedSegments, seekTo]
    )

    useImperativeHandle(
      ref,
      () => ({
        togglePlay,
        seekTo,
        seekBy: (delta: number) => {
          const video = videoRef.current
          if (video) seekTo(video.currentTime + delta)
        },
        getCurrentTime: () => videoRef.current?.currentTime ?? 0
      }),
      [togglePlay, seekTo]
    )

    const cycleRate = useCallback(() => {
      const next = (rateIndex + 1) % PLAYBACK_RATES.length
      setRateIndex(next)
      const video = videoRef.current
      if (video) video.playbackRate = PLAYBACK_RATES[next]!
    }, [rateIndex])

    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            src={sourceUrl}
            className="h-full w-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onClick={togglePlay}
            onPlay={() => {
              setIsPlaying(true)
              onPlayingChange?.(true)
            }}
            onPause={() => {
              setIsPlaying(false)
              onPlayingChange?.(false)
            }}
            onEnded={() => {
              setIsPlaying(false)
              onPlayingChange?.(false)
            }}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration
              if (Number.isFinite(d) && d > 0) onDurationChange?.(d)
            }}
            muted={muted}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => jumpToBoundary('prev')}
            title={t('prevBoundary')}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SkipBack className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            title={t('playPause')}
            className="rounded-md bg-primary p-2 text-primary-foreground transition-opacity hover:opacity-90"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Play className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            onClick={() => jumpToBoundary('next')}
            title={t('nextBoundary')}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SkipForward className="h-4 w-4" strokeWidth={1.75} />
          </button>

          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
            {formatClock(clock.current)}
            <span className="mx-1 text-muted-foreground/50">/</span>
            {formatClock(clock.total)}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={cycleRate}
              title={t('playbackRate')}
              className="min-w-11 rounded-md border border-border px-2 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground transition-colors hover:text-foreground"
            >
              {PLAYBACK_RATES[rateIndex]}×
            </button>
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              title={muted ? t('unmute') : t('mute')}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {muted ? (
                <VolumeX className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Volume2 className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setSegmentMode(!segmentMode)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                segmentMode
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {segmentMode ? t('playSegments') : t('playAll')}
            </button>
          </div>
        </div>
      </div>
    )
  }
)
