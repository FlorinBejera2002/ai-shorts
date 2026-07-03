'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, Scissors, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useEditorState, parseSegments } from '@/components/editor/use-editor-state'
import { SegmentPlayer } from '@/components/editor/segment-player'
import { Timeline } from '@/components/editor/timeline'
import { SegmentList } from '@/components/editor/segment-list'

interface ClipData {
  id: string
  title: string
  start_time: number
  end_time: number
  duration: number
  segments: any[] | null
  source_video_url: string | null
}

export default function ClipEditorPage() {
  const params = useParams<{ id: string }>()
  const t = useTranslations('editor')
  const toast = useToast()

  const [clip, setClip] = useState<ClipData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined)
  const [videoDuration, setVideoDuration] = useState(0)

  // Fetch clip data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/clips/${params.id}`)
        if (!res.ok) throw new Error('Failed to fetch clip')
        const data = await res.json()
        setClip(data)
        setVideoDuration(data.end_time + 30)
      } catch {
        toast.add('error', t('exportFailed'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [params.id])

  const initialSegments = clip
    ? parseSegments(clip.segments, clip.start_time, clip.end_time)
    : []

  const { state, dispatch, totalDuration, canExport, hasOverlap } = useEditorState(initialSegments)

  // Reinitialize when clip data loads
  useEffect(() => {
    if (clip) {
      const segs = parseSegments(clip.segments, clip.start_time, clip.end_time)
      dispatch({ type: 'SET_SEGMENTS', segments: segs })
      setVideoDuration(clip.end_time + 30)
    }
  }, [clip])

  const handleExport = useCallback(async () => {
    if (!canExport || exporting) return
    setExporting(true)
    try {
      const res = await fetch(`/api/clips/${params.id}/recut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: state.segments.map((s, i) => ({
            start: s.start,
            end: s.end,
            order: i,
          })),
        }),
      })
      if (!res.ok) throw new Error('Export failed')
      toast.add('success', t('exportSuccess'))
    } catch {
      toast.add('error', t('exportFailed'))
    } finally {
      setExporting(false)
    }
  }, [canExport, exporting, params.id, state.segments, t, toast])

  const handleSeek = useCallback((time: number) => {
    setSeekTo(time)
    setTimeout(() => setSeekTo(undefined), 50)
  }, [])

  const handleAddSegment = useCallback(() => {
    const lastSeg = state.segments[state.segments.length - 1]
    const newStart = lastSeg ? lastSeg.end + 1 : 0
    const newEnd = Math.min(newStart + 5, videoDuration)
    if (newEnd - newStart >= 0.25) {
      dispatch({ type: 'ADD_SEGMENT', start: newStart, end: newEnd })
    }
  }, [state.segments, videoDuration, dispatch])

  const handleAddAt = useCallback(
    (time: number) => {
      const end = Math.min(time + 5, videoDuration)
      if (end - time >= 0.25) {
        dispatch({ type: 'ADD_SEGMENT', start: time, end })
      }
    },
    [videoDuration, dispatch]
  )

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!clip || !clip.source_video_url) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted-foreground">{t('noSource')}</p>
        <Link
          href={`/dashboard/clips/${params.id}`}
          className="text-primary hover:underline"
        >
          {t('back')}
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/clips/${params.id}`}
            className="rounded-md p-1.5 hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <span className="text-sm text-muted-foreground">— {clip.title}</span>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport || exporting}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Scissors className="h-4 w-4" />
          )}
          {exporting ? t('exporting') : t('export')}
        </button>
      </div>

      {/* Player */}
      <SegmentPlayer
        sourceUrl={clip.source_video_url}
        segments={state.segments}
        onTimeUpdate={setCurrentTime}
        seekTo={seekTo}
      />

      {/* Timeline */}
      <Timeline
        duration={videoDuration}
        segments={state.segments}
        selectedIndex={state.selectedIndex}
        currentTime={currentTime}
        onResize={(i, start, end) =>
          dispatch({ type: 'RESIZE_SEGMENT', index: i, start, end })
        }
        onMove={(i, start, end) =>
          dispatch({ type: 'MOVE_SEGMENT', index: i, start, end })
        }
        onSelect={i => dispatch({ type: 'SELECT_SEGMENT', index: i })}
        onAddAt={handleAddAt}
        onSeek={handleSeek}
      />

      {/* Segment list */}
      <SegmentList
        segments={state.segments}
        selectedIndex={state.selectedIndex}
        onSelect={i => dispatch({ type: 'SELECT_SEGMENT', index: i })}
        onDelete={i => dispatch({ type: 'DELETE_SEGMENT', index: i })}
        onReorder={(i, dir) =>
          dispatch({ type: 'REORDER_SEGMENT', index: i, direction: dir })
        }
        onAdd={handleAddSegment}
        totalDuration={totalDuration}
        canAddMore={state.segments.length < 10}
      />

      {/* Validation messages */}
      {hasOverlap() && (
        <p className="text-sm text-destructive">{t('segmentsOverlap')}</p>
      )}
      {totalDuration > 0 && totalDuration < 3 && (
        <p className="text-sm text-destructive">{t('minDuration')}</p>
      )}
    </div>
  )
}
