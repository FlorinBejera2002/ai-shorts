'use client'

import '@/components/clips/media-workbench.css'

import { apiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'

import {
  AlertTriangle,
  Clock,
  Film,
  Loader2,
  Redo2,
  Save,
  Sparkles,
  SplitSquareHorizontal,
  Undo2
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type AssistantAction,
  AssistantChat
} from '@/components/assistant/assistant-chat'
import {
  ExportDialog,
  type ExportPhase
} from '@/components/editor/export-dialog'
import { SegmentInspector } from '@/components/editor/segment-inspector'
import { SegmentList } from '@/components/editor/segment-list'
import {
  SegmentPlayer,
  type SegmentPlayerHandle
} from '@/components/editor/segment-player'
import { MAX_ZOOM, MIN_ZOOM, Timeline } from '@/components/editor/timeline'
import { useEditorShortcuts } from '@/components/editor/use-editor-shortcuts'
import {
  MAX_SEGMENTS,
  MIN_SEGMENT_DURATION,
  parseSegments,
  useEditorState
} from '@/components/editor/use-editor-state'
import { useToast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import { extractApiError } from '@/lib/api-error'

interface ClipData {
  id: string
  title: string
  start_time: number
  end_time: number
  duration: number
  segments: unknown[] | null
  source_video_url: string | null
}

export default function ClipEditorPage() {
  const params = useParams<{ id: string }>()
  const t = useTranslations('editor')
  const tAssistant = useTranslations('assistant')
  const toast = useToast()

  const [clip, setClip] = useState<ClipData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [videoDuration, setVideoDuration] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportPhase, setExportPhase] = useState<ExportPhase>('confirm')

  const playerRef = useRef<SegmentPlayerHandle>(null)

  const {
    state,
    dispatch,
    totalDuration,
    canExport,
    hasOverlap,
    canUndo,
    canRedo
  } = useEditorState([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch exactly once per clip id; dispatch/toast/t are stable
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(`/api/clips/${params.id}`)
        if (!res.ok) throw new Error('Failed to fetch clip')
        const data: ClipData = await res.json()
        if (cancelled) return
        setClip(data)
        setVideoDuration(data.end_time + 30)
        dispatch({
          type: 'SET_SEGMENTS',
          segments: parseSegments(data.segments, data.start_time, data.end_time)
        })
      } catch {
        if (!cancelled) toast.add('error', t('loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [params.id])

  // Smooth playhead while playing
  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const tick = () => {
      const time = playerRef.current?.getCurrentTime()
      if (time !== undefined) setCurrentTime(time)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time)
    setCurrentTime(time)
  }, [])

  const handleAddAt = useCallback(
    (time: number) => {
      const end = Math.min(time + 5, videoDuration)
      if (end - time >= MIN_SEGMENT_DURATION) {
        dispatch({ type: 'ADD_SEGMENT', start: time, end })
      }
    },
    [videoDuration, dispatch]
  )

  const handleAddSegment = useCallback(() => {
    const maxEnd = state.segments.reduce((max, s) => Math.max(max, s.end), 0)
    const start = Math.min(maxEnd + 0.5, Math.max(0, videoDuration - 1))
    const end = Math.min(start + 5, videoDuration)
    if (end - start >= MIN_SEGMENT_DURATION) {
      dispatch({ type: 'ADD_SEGMENT', start, end })
    }
  }, [state.segments, videoDuration, dispatch])

  const handleSplit = useCallback(() => {
    dispatch({ type: 'SPLIT_AT', time: currentTime })
  }, [dispatch, currentTime])

  const canSplit =
    state.segments.length < MAX_SEGMENTS &&
    state.segments.some(
      (s) =>
        currentTime >= s.start + MIN_SEGMENT_DURATION &&
        currentTime <= s.end - MIN_SEGMENT_DURATION
    )

  const handleDeleteSelected = useCallback(() => {
    if (state.selectedIndex !== null && state.segments.length > 1) {
      dispatch({ type: 'DELETE_SEGMENT', index: state.selectedIndex })
    }
  }, [dispatch, state.selectedIndex, state.segments.length])

  const setBoundAtPlayhead = useCallback(
    (bound: 'start' | 'end') => {
      const index = state.selectedIndex
      if (index === null) return
      const seg = state.segments[index]
      if (!seg) return
      if (bound === 'start') {
        dispatch({
          type: 'SET_TIMES',
          index,
          start: Math.min(currentTime, seg.end - MIN_SEGMENT_DURATION),
          end: seg.end
        })
      } else {
        dispatch({
          type: 'SET_TIMES',
          index,
          start: seg.start,
          end: Math.max(currentTime, seg.start + MIN_SEGMENT_DURATION)
        })
      }
    },
    [dispatch, state.selectedIndex, state.segments, currentTime]
  )

  const handleZoomStep = useCallback((direction: 1 | -1) => {
    setZoom((z) =>
      Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, direction === 1 ? z * 1.25 : z * 0.8)
      )
    )
  }, [])

  const handleAssistantActions = useCallback(
    (actions: AssistantAction[]) => {
      for (const action of actions) {
        if (
          action.type === 'apply_segments' &&
          Array.isArray(action.segments)
        ) {
          const segments = (
            action.segments as { start?: unknown; end?: unknown }[]
          )
            .filter(
              (s) => typeof s.start === 'number' && typeof s.end === 'number'
            )
            .map((s) => ({ start: s.start as number, end: s.end as number }))
          if (segments.length > 0) {
            dispatch({ type: 'APPLY_SEGMENTS', segments })
          }
        } else if (action.type === 'seek' && typeof action.time === 'number') {
          handleSeek(action.time)
        }
      }
    },
    [dispatch, handleSeek]
  )

  useEditorShortcuts({
    onTogglePlay: () => playerRef.current?.togglePlay(),
    onSeekBy: (delta) => playerRef.current?.seekBy(delta),
    onSplit: handleSplit,
    onDeleteSelected: handleDeleteSelected,
    onSetStartAtPlayhead: () => setBoundAtPlayhead('start'),
    onSetEndAtPlayhead: () => setBoundAtPlayhead('end'),
    onUndo: () => dispatch({ type: 'UNDO' }),
    onRedo: () => dispatch({ type: 'REDO' }),
    onZoom: handleZoomStep
  })

  const handleExport = useCallback(async () => {
    setExportPhase('submitting')
    try {
      const res = await apiFetch(`/api/clips/${params.id}/recut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: state.segments.map((s, i) => ({
            start: s.start,
            end: s.end,
            order: i
          }))
        })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.add('error', extractApiError(data, t('exportFailed')))
        setExportPhase('confirm')
        return
      }
      dispatch({ type: 'MARK_SAVED' })
      setExportPhase('done')
    } catch {
      toast.add('error', t('exportFailed'))
      setExportPhase('confirm')
    }
  }, [params.id, state.segments, dispatch, toast, t])

  if (loading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="h-28 animate-pulse rounded-md bg-foreground/10" />
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="h-72 animate-pulse rounded-md border border-border" />
          <div className="aspect-video animate-pulse rounded-md bg-foreground/10" />
        </div>
      </div>
    )
  }

  if (!clip || !clip.source_video_url) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
        <Film className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
        <p className="text-muted-foreground">{t('noSource')}</p>
        <Link
          href={`/dashboard/clips/${params.id}`}
          className="font-medium text-primary hover:underline"
        >
          {t('back')}
        </Link>
      </div>
    )
  }

  const overlap = hasOverlap()
  const tooShort = totalDuration > 0 && totalDuration < 3

  return (
    <div className="clip-cutter-page animate-fade-in">
      <header className="clip-cutter-hero">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 py-1">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
              {t('title')}
            </p>
            <h1 className="text-lg font-semibold text-white sm:text-xl">
              {clip.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                asChild={true}
                variant="ghost"
                className="rounded-md border border-white/20 bg-white/10 text-white hover:bg-white/15"
              >
                <Link
                  data-studio-trigger="true"
                  href={`/dashboard/studio?clip=${encodeURIComponent(clip.id)}`}
                >
                  <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                  {t('openStudio')}
                </Link>
              </Button>
              <p className="max-w-md text-xs leading-relaxed text-white/55">
                {t('openStudioDescription')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
          <Button
            type="button"
            data-export-trigger="true"
            onClick={() => {
              setExportPhase('confirm')
              setExportOpen(true)
            }}
            disabled={!canExport || !state.isDirty}
            variant="default"
            className="ml-1.5 rounded-md bg-white text-black hover:bg-white/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" strokeWidth={1.75} />
            {t('saveChanges')}
          </Button>
        </div>

        {state.isDirty && (
          <span className="clip-cutter-unsaved-badge">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            {t('unsaved')}
          </span>
        )}
      </header>

      <div className="clip-cutter-workspace">
        <aside className="clip-cutter-sidebar">
          <div className="clip-cutter-assistant">
            <AssistantChat
              context="editor"
              clipId={params.id}
              getState={() => ({
                segments: state.segments.map((s) => ({
                  start: s.start,
                  end: s.end
                })),
                video_duration: videoDuration,
                current_time: currentTime
              })}
              onActions={handleAssistantActions}
              suggestions={[
                tAssistant('suggestEditor1'),
                tAssistant('suggestEditor2'),
                tAssistant('suggestEditor3')
              ]}
            />
          </div>
          <div className="clip-cutter-segment-tools">
            <SegmentInspector
              segment={
                state.selectedIndex !== null
                  ? (state.segments[state.selectedIndex] ?? null)
                  : null
              }
              index={state.selectedIndex}
              duration={videoDuration}
              onSetTimes={(index, start, end) =>
                dispatch({ type: 'SET_TIMES', index, start, end })
              }
            />
            <SegmentList
              segments={state.segments}
              selectedIndex={state.selectedIndex}
              activeIndex={activeIndex}
              onSelect={(i) => dispatch({ type: 'SELECT_SEGMENT', index: i })}
              onSeek={handleSeek}
              onDelete={(i) => dispatch({ type: 'DELETE_SEGMENT', index: i })}
              onReorder={(i, dir) =>
                dispatch({ type: 'REORDER_SEGMENT', index: i, direction: dir })
              }
              onAdd={handleAddSegment}
              totalDuration={totalDuration}
              canAddMore={state.segments.length < MAX_SEGMENTS}
            />
          </div>
        </aside>

        <main className="clip-cutter-preview">
          <SegmentPlayer
            ref={playerRef}
            sourceUrl={clip.source_video_url}
            segments={state.segments}
            onTimeUpdate={setCurrentTime}
            onPlayingChange={setIsPlaying}
            onActiveSegmentChange={setActiveIndex}
            onDurationChange={setVideoDuration}
          />
          <section className="clip-cutter-timeline">
            <Timeline
              actions={
                <div className="clip-cutter-timeline-actions">
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    onClick={() => dispatch({ type: 'UNDO' })}
                    disabled={!canUndo}
                    aria-label={t('undo')}
                  >
                    <Undo2 className="h-4 w-4" strokeWidth={1.75} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    onClick={() => dispatch({ type: 'REDO' })}
                    disabled={!canRedo}
                    aria-label={t('redo')}
                  >
                    <Redo2 className="h-4 w-4" strokeWidth={1.75} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    onClick={handleSplit}
                    disabled={!canSplit}
                    aria-label={t('splitAtPlayhead')}
                  >
                    <SplitSquareHorizontal
                      className="h-4 w-4"
                      strokeWidth={1.75}
                    />
                  </Button>
                </div>
              }
              duration={videoDuration}
              sourceUrl={clip.source_video_url}
              segments={state.segments}
              selectedIndex={state.selectedIndex}
              activeIndex={activeIndex}
              currentTime={currentTime}
              isPlaying={isPlaying}
              zoom={zoom}
              onZoomChange={setZoom}
              onBeginDrag={() => dispatch({ type: 'BEGIN_DRAG' })}
              onResize={(i, start, end) =>
                dispatch({ type: 'RESIZE_SEGMENT', index: i, start, end })
              }
              onMove={(i, start, end) =>
                dispatch({ type: 'MOVE_SEGMENT', index: i, start, end })
              }
              onSelect={(i) => dispatch({ type: 'SELECT_SEGMENT', index: i })}
              onAddAt={handleAddAt}
              onSeek={handleSeek}
            />
          </section>
        </main>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 tabular-nums">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          {t('totalDuration', { duration: `${totalDuration.toFixed(1)}s` })}
        </span>
        <span className="tabular-nums">
          {t('segments', { count: state.segments.length })} / {MAX_SEGMENTS}
        </span>
        {overlap && (
          <span className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
            <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
            {t('segmentsOverlap')}
          </span>
        )}
        {tooShort && (
          <span className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
            <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
            {t('minDuration')}
          </span>
        )}
        {!overlap && !tooShort && totalDuration > 60 && (
          <span className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 font-medium text-warning">
            <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
            {t('longClipWarning')}
          </span>
        )}
        {exportPhase === 'submitting' && (
          <span className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('exporting')}
          </span>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        phase={exportPhase}
        segmentCount={state.segments.length}
        totalDuration={totalDuration}
        clipId={params.id}
        onConfirm={() => void handleExport()}
        onClose={() => setExportOpen(false)}
      />
    </div>
  )
}
