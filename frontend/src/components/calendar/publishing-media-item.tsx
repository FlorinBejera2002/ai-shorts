'use client'

import type { PublishingMedia } from '@/lib/content-calendar'
import { Reorder, useDragControls } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  GripVertical,
  ImagePlus,
  Play,
  X
} from 'lucide-react'
import { useTranslations } from 'next-intl'

const controlClass =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground disabled:pointer-events-none disabled:opacity-25'

export function PublishingMediaItem({
  item,
  index,
  count,
  previewUrl,
  disabled,
  onMove,
  onRemove
}: {
  item: PublishingMedia
  index: number
  count: number
  previewUrl?: string
  disabled: boolean
  onMove: (reference: string, targetIndex: number) => void
  onRemove: (reference: string) => void
}) {
  const t = useTranslations('contentCalendar.form')
  const dragControls = useDragControls()
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragMomentum={false}
      dragControls={dragControls}
      drag={disabled ? false : 'y'}
      className="relative rounded-md border border-border bg-card p-2"
      whileDrag={{ zIndex: 1 }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className={`${controlClass} touch-none cursor-grab active:cursor-grabbing`}
          disabled={disabled || count < 2}
          aria-label={t('dragMedia', { name: item.name })}
          onPointerDown={(event) => {
            if (!disabled) dragControls.start(event)
          }}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border">
          {previewUrl ? (
            item.type === 'image' ? (
              <img
                src={previewUrl}
                alt={item.name}
                draggable={false}
                className="size-full object-contain"
              />
            ) : (
              <video
                src={previewUrl}
                className="size-full object-contain"
                muted={true}
                playsInline={true}
                controls={true}
                preload="metadata"
              />
            )
          ) : item.type === 'video' ? (
            <Play className="size-5" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {index + 1} / {count}
            {index === 0 ? ` · ${t('mediaCover')}` : ''}
          </p>
        </div>
        <button
          type="button"
          className={controlClass}
          disabled={disabled}
          aria-label={t('removeMedia', { name: item.name })}
          onClick={() => onRemove(item.reference)}
        >
          <X className="size-4" />
        </button>
      </div>
      {count > 1 && (
        <div className="mt-1 flex items-center justify-end gap-1">
          <button
            type="button"
            className={`${controlClass} mr-auto w-auto gap-1.5 px-2 text-xs`}
            disabled={disabled || index === 0}
            aria-label={t('makeMediaFirst', { name: item.name })}
            onClick={() => onMove(item.reference, 0)}
          >
            <ArrowUpToLine className="size-3.5" />
            {t('mediaFirst')}
          </button>
          <button
            type="button"
            className={controlClass}
            disabled={disabled || index === 0}
            aria-label={t('moveMediaLeft', { name: item.name })}
            onClick={() => onMove(item.reference, index - 1)}
          >
            <ArrowUp className="size-4" />
          </button>
          <button
            type="button"
            className={controlClass}
            disabled={disabled || index === count - 1}
            aria-label={t('moveMediaRight', { name: item.name })}
            onClick={() => onMove(item.reference, index + 1)}
          >
            <ArrowDown className="size-4" />
          </button>
        </div>
      )}
    </Reorder.Item>
  )
}
