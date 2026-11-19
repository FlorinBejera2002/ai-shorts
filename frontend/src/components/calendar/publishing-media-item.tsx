'use client'

import type { PublishingMedia } from '@/lib/content-calendar'
import { Reorder, useDragControls, type DragControls } from 'framer-motion'
import { Crop, GripVertical, ImagePlus, Play, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { PublishingImageEditor } from './publishing-image-editor'
import { PublishingImagePreview } from './publishing-image-preview'
import styles from './post-media-dialog.module.css'

type PublishingMediaItemProps = {
  item: PublishingMedia
  index: number
  count: number
  previewUrl?: string
  disabled: boolean
  instagramEnabled?: boolean
  facebookEnabled?: boolean
  tiktokEnabled?: boolean
  /** `tile` is the dialog's device grid; `row` is the inline list. */
  variant?: 'row' | 'tile'
  onChange: (item: PublishingMedia) => void
  onMove: (reference: string, targetIndex: number) => void
  onRemove: (reference: string) => void
}

const MOVE_KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowUp: index => index - 1,
  ArrowLeft: index => index - 1,
  ArrowDown: index => index + 1,
  ArrowRight: index => index + 1,
  Home: () => 0,
  End: (_index, count) => count - 1
}

/** Keyboard reordering shared by the tile badge and the row handle. */
function useKeyboardMove(reference: string, index: number, count: number, disabled: boolean, onMove: PublishingMediaItemProps['onMove']) {
  return (event: KeyboardEvent<HTMLButtonElement>) => {
    const target = MOVE_KEYS[event.key]?.(index, count)
    if (target === undefined || disabled) return
    event.preventDefault()
    onMove(reference, target)
  }
}

function MediaDragHandle({ item, index, count, disabled, dragControls, describedBy, variant, onMove }: {
  item: PublishingMedia
  index: number
  count: number
  disabled: boolean
  dragControls: DragControls
  describedBy: string
  variant: 'row' | 'tile'
  onMove: PublishingMediaItemProps['onMove']
}) {
  const t = useTranslations('contentCalendar.form')
  const onKeyDown = useKeyboardMove(item.reference, index, count, disabled, onMove)
  const isTile = variant === 'tile'
  return (
    <button
      type="button"
      className={isTile ? styles.tileBadge : `${styles.mediaControl} ${styles.mediaDrag} touch-none cursor-grab active:cursor-grabbing`}
      disabled={disabled || count < 2}
      aria-label={t('dragMedia', { name: item.name })}
      aria-describedby={describedBy}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End"
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        if (!disabled) dragControls.start(event)
      }}
      onKeyDown={onKeyDown}
    >
      {isTile ? index + 1 : <GripVertical className="size-4" />}
    </button>
  )
}

function MediaCropButton({ item, expanded, disabled, buttonRef, variant, onToggle }: {
  item: PublishingMedia
  expanded: boolean
  disabled: boolean
  buttonRef: RefObject<HTMLButtonElement | null>
  variant: 'row' | 'tile'
  onToggle: () => void
}) {
  const imageT = useTranslations('contentCalendar.imageEditor')
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={variant === 'tile' ? styles.tileCrop : styles.mediaControl}
      disabled={disabled}
      aria-label={imageT('edit', { name: item.name })}
      ref={buttonRef}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      onClick={onToggle}
    >
      <Crop className="size-4" />
      <span className="sr-only">{imageT(expanded ? 'close' : 'editButton')}</span>
    </Button>
  )
}

function MediaRemoveButton({ item, disabled, variant, onRemove }: {
  item: PublishingMedia
  disabled: boolean
  variant: 'row' | 'tile'
  onRemove: (reference: string) => void
}) {
  const t = useTranslations('contentCalendar.form')
  return (
    <button
      type="button"
      className={variant === 'tile' ? styles.tileRemove : styles.mediaControl}
      disabled={disabled}
      aria-label={t('removeMedia', { name: item.name })}
      onClick={() => onRemove(item.reference)}
    >
      <X className="size-4" />
    </button>
  )
}

/** Inline crop editor for photo items, opened from the crop button. */
function MediaCropEditor({ item, previewUrl, disabled, instagramEnabled, facebookEnabled, tiktokEnabled, count, buttonRef, onChange, onClose }: {
  item: PublishingMedia
  previewUrl?: string
  disabled: boolean
  instagramEnabled: boolean
  facebookEnabled: boolean
  tiktokEnabled: boolean
  count: number
  buttonRef: RefObject<HTMLButtonElement | null>
  onChange: (item: PublishingMedia) => void
  onClose: () => void
}) {
  return (
    <PublishingImageEditor
      item={item}
      previewUrl={previewUrl}
      disabled={disabled}
      instagramEnabled={instagramEnabled}
      facebookEnabled={facebookEnabled}
      tiktokEnabled={tiktokEnabled}
      carousel={instagramEnabled && count > 1}
      onChange={onChange}
      onClose={() => {
        onClose()
        requestAnimationFrame(() => buttonRef.current?.focus())
      }}
    />
  )
}

export function PublishingMediaItem({
  item,
  index,
  count,
  previewUrl,
  disabled,
  instagramEnabled = false,
  facebookEnabled = false,
  tiktokEnabled = false,
  variant = 'row',
  onChange,
  onMove,
  onRemove
}: PublishingMediaItemProps) {
  const t = useTranslations('contentCalendar.form')
  const [expanded, setExpanded] = useState(false)
  const dragControls = useDragControls()
  const keyboardHintId = useId()
  const editButton = useRef<HTMLButtonElement>(null)
  const photoEditorEnabled = instagramEnabled || facebookEnabled || tiktokEnabled
  const showCrop = photoEditorEnabled && item.type === 'image'
  const isTile = variant === 'tile'

  const sharedProps = { item, index, count, disabled, dragControls, describedBy: keyboardHintId, variant, onMove }
  const handle = <MediaDragHandle {...sharedProps} />
  const keyboardHint = <KeyboardHint id={keyboardHintId} />
  const cropButton = showCrop && (
    <MediaCropButton item={item} expanded={expanded} disabled={disabled} buttonRef={editButton} variant={variant} onToggle={() => setExpanded(value => !value)} />
  )
  const removeButton = <MediaRemoveButton item={item} disabled={disabled} variant={variant} onRemove={onRemove} />
  const editor = showCrop && expanded && (
    <MediaCropEditor item={item} previewUrl={previewUrl} disabled={disabled} instagramEnabled={instagramEnabled}
      facebookEnabled={facebookEnabled} tiktokEnabled={tiktokEnabled} count={count} buttonRef={editButton}
      onChange={onChange} onClose={() => setExpanded(false)} />
  )
  const thumbnail = <PublishingMediaThumbnail item={item} previewUrl={previewUrl} showCrop={photoEditorEnabled} />

  if (isTile) {
    return (
      <Reorder.Item
        value={item}
        dragListener={false}
        dragMomentum={false}
        dragControls={dragControls}
        drag={disabled ? false : 'x'}
        className={styles.tile}
        data-expanded={expanded || undefined}
        whileDrag={{ zIndex: 1 }}
      >
        <div className={styles.tileMedia} onPointerDown={event => startDragFromMedia(event, dragControls, disabled, count)}>
          {thumbnail}
        </div>
        {handle}
        {removeButton}
        {cropButton}
        {keyboardHint}
        {editor}
      </Reorder.Item>
    )
  }

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragMomentum={false}
      dragControls={dragControls}
      drag={disabled ? false : 'y'}
      className={styles.mediaItem}
      whileDrag={{ zIndex: 1 }}
    >
      <div className={styles.mediaRow}>
        {handle}
        {keyboardHint}
        <div className={styles.mediaThumbnail}>{thumbnail}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {index + 1} / {count}
            {index === 0 ? ` · ${t('mediaCover')}` : ''}
          </p>
        </div>
        {cropButton}
        {removeButton}
      </div>
      {editor}
    </Reorder.Item>
  )
}

function KeyboardHint({ id }: { id: string }) {
  const t = useTranslations('contentCalendar.form')
  return (
    <span id={id} className="sr-only">
      {t('mediaKeyboardHint')}
    </span>
  )
}

/** Dragging starts from the thumbnail in the tile grid, but not from its buttons. */
function startDragFromMedia(event: PointerEvent<HTMLDivElement>, dragControls: DragControls, disabled: boolean, count: number) {
  const fromButton = (event.target as HTMLElement).closest('button')
  if (!disabled && count > 1 && event.button === 0 && !fromButton) dragControls.start(event)
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
