'use client'

import { ArrowLeftToLine, ArrowRightToLine, Minus, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { Segment } from './use-editor-state'

interface SegmentInspectorProps {
  segment: Segment | null
  index: number | null
  currentTime: number
  duration: number
  canDelete: boolean
  onSetTimes: (index: number, start: number, end: number) => void
  onDelete: (index: number) => void
}

function NudgeField({
  id,
  label,
  value,
  min,
  max,
  onCommit
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onCommit(Math.max(min, value - 0.1))}
          aria-label={`${label} -0.1s`}
          className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Minus className="h-3 w-3" strokeWidth={2} />
        </button>
        <input
          id={id}
          type="number"
          step={0.1}
          min={min}
          max={max}
          value={Number(value.toFixed(2))}
          onChange={(e) => {
            const parsed = Number(e.target.value)
            if (Number.isFinite(parsed)) {
              onCommit(Math.min(max, Math.max(min, parsed)))
            }
          }}
          className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-center text-[13px] tabular-nums outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <button
          type="button"
          onClick={() => onCommit(Math.min(max, value + 0.1))}
          aria-label={`${label} +0.1s`}
          className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

export function SegmentInspector({
  segment,
  index,
  currentTime,
  duration,
  canDelete,
  onSetTimes,
  onDelete
}: SegmentInspectorProps) {
  const t = useTranslations('editor')

  if (!segment || index === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('inspector')}
        </h3>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t('inspectorEmpty')}
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in rounded-xl border border-primary/30 bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('segment', { number: index + 1 })}
        </h3>
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
          {(segment.end - segment.start).toFixed(1)}s
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <NudgeField
          id="inspector-start"
          label={t('startTime')}
          value={segment.start}
          min={0}
          max={segment.end - 0.25}
          onCommit={(v) => onSetTimes(index, v, segment.end)}
        />
        <NudgeField
          id="inspector-end"
          label={t('endTime')}
          value={segment.end}
          min={segment.start + 0.25}
          max={duration}
          onCommit={(v) => onSetTimes(index, segment.start, v)}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() =>
            onSetTimes(
              index,
              Math.min(currentTime, segment.end - 0.25),
              segment.end
            )
          }
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <ArrowLeftToLine className="h-3 w-3" strokeWidth={1.75} />
          {t('setStartHere')}
        </button>
        <button
          type="button"
          onClick={() =>
            onSetTimes(
              index,
              segment.start,
              Math.max(currentTime, segment.start + 0.25)
            )
          }
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <ArrowRightToLine className="h-3 w-3" strokeWidth={1.75} />
          {t('setEndHere')}
        </button>
      </div>

      <button
        type="button"
        onClick={() => onDelete(index)}
        disabled={!canDelete}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 px-2 py-1.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
      >
        <Trash2 className="h-3 w-3" strokeWidth={1.75} />
        {t('deleteSegment')}
      </button>
    </div>
  )
}
