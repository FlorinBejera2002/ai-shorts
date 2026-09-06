'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { Segment } from './use-editor-state'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

interface SegmentListProps {
  segments: Segment[]
  selectedIndex: number | null
  activeIndex: number | null
  onSelect: (index: number | null) => void
  onSeek: (time: number) => void
  onDelete: (index: number) => void
  onReorder: (index: number, direction: 'up' | 'down') => void
  onAdd: () => void
  totalDuration: number
  canAddMore: boolean
}

export function SegmentList({
  segments,
  selectedIndex,
  activeIndex,
  onSelect,
  onSeek,
  onDelete,
  onReorder,
  onAdd,
  totalDuration,
  canAddMore
}: SegmentListProps) {
  const t = useTranslations('editor')

  return (
    <Card className="block gap-0 py-0 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('segments', { count: segments.length })}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {t('totalDuration', { duration: `${totalDuration.toFixed(1)}s` })}
        </span>
      </div>

      <div className="space-y-1">
        {segments.map((seg, i) => {
          const isSelected = selectedIndex === i
          const isActive = activeIndex === i
          return (
            <div
              key={i}
              className={`flex flex-wrap items-center gap-1 rounded-lg border p-1 text-sm transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent hover:bg-muted'
              }`}
            >
              <Button
                variant="ghost"
                type="button"
                aria-pressed={isSelected}
                aria-label={t('segment', { number: i + 1 })}
                onClick={() => {
                  onSelect(isSelected ? null : i)
                  onSeek(seg.start)
                }}
                className="h-auto min-h-10 min-w-0 flex-1 justify-start gap-2 px-2 py-1.5"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="tabular-nums text-[13px] text-muted-foreground">
                  {formatTime(seg.start)} → {formatTime(seg.end)}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground/70">
                  {(seg.end - seg.start).toFixed(1)}s
                </span>
              </Button>

              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  type="button"
                  title={t('moveUp')}
                  disabled={i === 0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onReorder(i, 'up')
                  }}
                  className="h-auto whitespace-normal rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  title={t('moveDown')}
                  disabled={i === segments.length - 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    onReorder(i, 'down')
                  }}
                  className="h-auto whitespace-normal rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  title={t('deleteSegment')}
                  disabled={segments.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(i)
                  }}
                  className="h-auto whitespace-normal rounded p-1 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-30"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <Button
        variant="ghost"
        type="button"
        onClick={onAdd}
        disabled={!canAddMore}
        className="h-auto whitespace-normal mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        {t('addSegment')}
      </Button>
    </Card>
  )
}
