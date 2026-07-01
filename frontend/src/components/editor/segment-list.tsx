'use client'

import { useTranslations } from 'next-intl'
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import type { Segment } from './use-editor-state'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

interface SegmentListProps {
  segments: Segment[]
  selectedIndex: number | null
  onSelect: (index: number | null) => void
  onDelete: (index: number) => void
  onReorder: (index: number, direction: 'up' | 'down') => void
  onAdd: () => void
  totalDuration: number
  canAddMore: boolean
}

export function SegmentList({
  segments,
  selectedIndex,
  onSelect,
  onDelete,
  onReorder,
  onAdd,
  totalDuration,
  canAddMore,
}: SegmentListProps) {
  const t = useTranslations('editor')

  return (
    <div className="flex flex-col gap-2">
      <div className="space-y-1">
        {segments.map((seg, i) => {
          const isSelected = selectedIndex === i
          const segDuration = seg.end - seg.start

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(isSelected ? null : i)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(isSelected ? null : i)
                }
              }}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent hover:bg-muted'
              }`}
            >
              <span className="min-w-[5rem] font-medium">
                {t('segment', { number: i + 1 })}
              </span>
              <span className="text-muted-foreground">
                {formatTime(seg.start)} → {formatTime(seg.end)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({segDuration.toFixed(1)}s)
              </span>

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  title={t('moveUp')}
                  disabled={i === 0}
                  onClick={e => {
                    e.stopPropagation()
                    onReorder(i, 'up')
                  }}
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={t('moveDown')}
                  disabled={i === segments.length - 1}
                  onClick={e => {
                    e.stopPropagation()
                    onReorder(i, 'down')
                  }}
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={t('deleteSegment')}
                  disabled={segments.length <= 1}
                  onClick={e => {
                    e.stopPropagation()
                    onDelete(i)
                  }}
                  className="rounded p-0.5 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between border-t pt-2 text-sm">
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAddMore}
          className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50 disabled:no-underline"
        >
          <Plus className="h-4 w-4" />
          {t('addSegment')}
        </button>
        <span className="text-muted-foreground">
          {t('totalDuration', { duration: totalDuration.toFixed(1) + 's' })}
        </span>
      </div>
    </div>
  )
}
