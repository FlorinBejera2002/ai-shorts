'use client'

import type { PublishingMedia } from '@/lib/content-calendar'
import { Reorder, useDragControls } from 'framer-motion'
import { Crop, GripVertical, ImagePlus, Play, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PublishingImageEditor } from './publishing-image-editor'
import { PublishingImagePreview } from './publishing-image-preview'

const controlClass =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground disabled:pointer-events-none disabled:opacity-25'

export function PublishingMediaItem({
  item,
  index,
  count,
  previewUrl,
  disabled,
  instagramEnabled = false,
  facebookEnabled = false,
  tiktokEnabled = false,
  onChange,
  onMove,
  onRemove
}: {
  item: PublishingMedia
  index: number
  count: number
  previewUrl?: string
  disabled: boolean
  instagramEnabled?: boolean
  facebookEnabled?: boolean
  tiktokEnabled?: boolean
  onChange: (item: PublishingMedia) => void
  onMove: (reference: string, targetIndex: number) => void
  onRemove: (reference: string) => void
}) {
  const t = useTranslations('contentCalendar.form')
  const imageT = useTranslations('contentCalendar.imageEditor')
  const [expanded, setExpanded] = useState(false)
  const dragControls = useDragControls()
  const keyboardHintId = useId()
  const editorId = useId()
  const photoEditorEnabled = instagramEnabled || facebookEnabled || tiktokEnabled
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
          <PublishingMediaThumbnail
            item={item}
            previewUrl={previewUrl}
            showCrop={photoEditorEnabled}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {index + 1} / {count}
            {index === 0 ? ` · ${t('mediaCover')}` : ''}
          </p>
          {photoEditorEnabled && item.type === 'image' && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="mt-1 -ml-2"
              disabled={disabled}
              aria-label={imageT('edit', { name: item.name })}
              aria-expanded={expanded}
              aria-controls={editorId}
              onClick={() => setExpanded(value => !value)}
            >
              <Crop className="size-3" />
              {imageT(expanded ? 'close' : 'editButton')}
            </Button>
          )}
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
      {photoEditorEnabled && item.type === 'image' && expanded && (
        <div id={editorId}>
          <PublishingImageEditor
            item={item}
            previewUrl={previewUrl}
            disabled={disabled}
            instagramEnabled={instagramEnabled}
            facebookEnabled={facebookEnabled}
            tiktokEnabled={tiktokEnabled}
            onChange={onChange}
          />
        </div>
      )}
    </Reorder.Item>
  )
}

function PublishingMediaThumbnail({
  item,
  previewUrl,
  showCrop
}: {
  item: PublishingMedia
  previewUrl?: string
  showCrop: boolean
}) {
  if (!previewUrl) {
    return item.type === 'video'
      ? <Play className="size-5" />
      : <ImagePlus className="size-5" />
  }
  if (item.type === 'image') {
    return (
      <PublishingImagePreview
        item={showCrop ? item : { ...item, crop: undefined }}
        src={previewUrl}
        thumbnail={true}
      />
    )
  }
  return (
    <video
      src={previewUrl}
      className="size-full object-contain"
      muted={true}
      playsInline={true}
      controls={true}
      preload="metadata"
    />
  )
}
