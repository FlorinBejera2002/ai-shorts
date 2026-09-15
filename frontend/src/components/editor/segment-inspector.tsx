'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { Minus, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { Segment } from './use-editor-state'

interface SegmentInspectorProps {
  segment: Segment | null
  index: number | null
  duration: number
  onSetTimes: (index: number, start: number, end: number) => void
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
      <Label className="text-[11px] text-muted-foreground" htmlFor={id}>
        {label}
      </Label>
      <div className="mt-1 flex items-center overflow-hidden rounded-md border border-input bg-background">
        <Button
          variant="ghost"
          type="button"
          onClick={() => onCommit(Math.max(min, value - 0.1))}
          aria-label={`${label} -0.1s`}
          className="clip-cutter-quiet-action h-9 w-9 shrink-0 rounded-none border-0 p-0 text-muted-foreground shadow-none transition-colors hover:text-foreground"
        >
          <Minus className="h-3 w-3" strokeWidth={2} />
        </Button>
        <Input
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
          className="h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 text-center text-[13px] tabular-nums shadow-none outline-none focus:border-0 focus:ring-0"
        />
        <Button
          variant="ghost"
          type="button"
          onClick={() => onCommit(Math.min(max, value + 0.1))}
          aria-label={`${label} +0.1s`}
          className="clip-cutter-quiet-action h-9 w-9 shrink-0 rounded-none border-0 p-0 text-muted-foreground shadow-none transition-colors hover:text-foreground"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
        </Button>
      </div>
    </div>
  )
}

export function SegmentInspector({
  segment,
  index,
  duration,
  onSetTimes
}: SegmentInspectorProps) {
  const t = useTranslations('editor')

  if (!segment || index === null) {
    return (
      <Card className="block gap-0 rounded-md border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('inspector')}
        </h3>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t('inspectorEmpty')}
        </p>
      </Card>
    )
  }

  return (
    <div className="animate-fade-in rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('segment', { number: index + 1 })}
        </h3>
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
          {(segment.end - segment.start).toFixed(1)}s
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
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
    </div>
  )
}
