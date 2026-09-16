'use client'

import type { PublishingMedia } from '@/lib/content-calendar'
import { Reorder, useDragControls } from 'framer-motion'
import { GripVertical, ImagePlus, Play, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'

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
  const keyboardHintId = useId()
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
          aria-describedby={keyboardHintId}
          aria-keyshortcuts="ArrowUp ArrowDown Home End"
          onPointerDown={(event) => {
            if (!disabled) dragControls.start(event)
          }}
          onKeyDown={(event) => {
            const targets: Record<string, number> = {
              ArrowUp: index - 1,
              ArrowDown: index + 1,
              Home: 0,
              End: count - 1
            }
            const target = targets[event.key]
            if (target === undefined || disabled) return
            event.preventDefault()
            onMove(item.reference, target)
          }}
        >
          <GripVertical className="size-4" />
        </button>
        <span id={keyboardHintId} className="sr-only">
          {t('mediaKeyboardHint')}
        </span>
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
    </Reorder.Item>
  )
}
