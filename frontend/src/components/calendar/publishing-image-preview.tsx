'use client'

import type { PublishingImageCrop, PublishingImageUserTag, PublishingMedia } from '@/lib/content-calendar'
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import {
  publishingImageAspectRatio,
  publishingImageCropStyle,
  publishingImageDragCrop
} from './publishing-image-utils'

const KEYBOARD_STEP_PX = 8
const ARROW_STEPS: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-KEYBOARD_STEP_PX, 0],
  ArrowRight: [KEYBOARD_STEP_PX, 0],
  ArrowUp: [0, -KEYBOARD_STEP_PX],
  ArrowDown: [0, KEYBOARD_STEP_PX]
}

function previewFrameStyle(ratio: number, thumbnail: boolean, fullSize: boolean): CSSProperties {
  if (thumbnail) {
    return ratio < 1
      ? { aspectRatio: ratio, height: '100%' }
      : { aspectRatio: ratio, width: '100%' }
  }
  return {
    aspectRatio: ratio,
    width: '100%',
    maxWidth: fullSize
      ? `calc(var(--publishing-image-height, 20rem) * ${ratio})`
      : `${20 * ratio}rem`
  }
}

/** Interactive attributes exist only while the crop can be moved; otherwise the frame is plain. */
function positioningAttributes(positionable: boolean, label?: string) {
  if (!positionable) return {}
  return { role: 'group', 'aria-label': label, tabIndex: 0, 'data-positionable': '' }
}

function ImageTagMarkers({ tags = [] }: { tags?: PublishingImageUserTag[] }) {
  return tags.map((tag, index) => (
    <span
      key={tag.username}
      title={tag.username}
      className='absolute flex size-5 items-center justify-center rounded-full border border-background bg-foreground text-[10px] text-background shadow-sm'
      style={{
        left: `clamp(10px, ${tag.x * 100}%, calc(100% - 10px))`,
        top: `clamp(10px, ${tag.y * 100}%, calc(100% - 10px))`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <span aria-hidden='true'>{index + 1}</span>
      <span className='sr-only'>{tag.username}</span>
    </span>
  ))
}

type CropPositioning = {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerEnd: (event: PointerEvent<HTMLDivElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

/** Pointer drag and arrow keys move the crop position; both are inert unless the frame can be positioned. */
function useCropPositioning({ crop, source, enabled, onCropChange }: {
  crop?: PublishingImageCrop
  source: { width: number; height: number }
  enabled: boolean
  onCropChange?: (crop: PublishingImageCrop) => void
}): CropPositioning {
  const dragStart = useRef<{ pointerId: number; x: number; y: number; crop: PublishingImageCrop } | null>(null)

  function reposition(frame: HTMLDivElement, dx: number, dy: number, from: PublishingImageCrop) {
    if (!onCropChange) return
    const rect = frame.getBoundingClientRect()
    onCropChange(publishingImageDragCrop(from, {
      dx,
      dy,
      frameWidth: rect.width,
      frameHeight: rect.height,
      sourceWidth: source.width,
      sourceHeight: source.height
    }))
  }

  return {
    onPointerDown(event) {
      if (!enabled || !crop) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, crop }
    },
    onPointerMove(event) {
      const start = dragStart.current
      if (!start || start.pointerId !== event.pointerId) return
      reposition(event.currentTarget, event.clientX - start.x, event.clientY - start.y, start.crop)
    },
    onPointerEnd(event) {
      if (dragStart.current?.pointerId !== event.pointerId) return
      dragStart.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    },
    onKeyDown(event) {
      const step = ARROW_STEPS[event.key]
      if (!enabled || !crop || !step) return
      event.preventDefault()
      reposition(event.currentTarget, step[0], step[1], crop)
    }
  }
}

function PublishedImage({ item, src, imageStyle, onSize }: {
  item: PublishingMedia
  src: string
  imageStyle?: CSSProperties
  onSize: (size: { width: number; height: number }) => void
}) {
  return (
    <img
      src={src}
      alt={item.altText || item.name}
      draggable={false}
      onLoad={event => onSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
      className='absolute max-w-none object-contain'
      style={imageStyle ?? { width: '100%', height: '100%', left: 0, top: 0 }}
    />
  )
}

export function PublishingImagePreview({
  item,
  src,
  thumbnail = false,
  fullSize = false,
  showUserTags = true,
  onCropChange,
  positionLabel
}: {
  item: PublishingMedia
  src: string
  thumbnail?: boolean
  fullSize?: boolean
  showUserTags?: boolean
  /** Enables dragging and arrow-key positioning of the crop; only for formats that carry a crop. */
  onCropChange?: (crop: PublishingImageCrop) => void
  positionLabel?: string
}) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const loaded = size.width > 0 && size.height > 0
  const originalRatio = loaded ? size.width / size.height : 1
  const ratio = item.crop ? publishingImageAspectRatio(item.crop.aspectRatio) : originalRatio
  const imageStyle = item.crop && loaded
    ? publishingImageCropStyle(size.width, size.height, item.crop)
    : undefined
  const positionable = Boolean(onCropChange && item.crop && loaded)
  const positioning = useCropPositioning({
    crop: item.crop,
    source: size,
    enabled: positionable,
    onCropChange
  })

  return (
    <div
      className='relative mx-auto overflow-hidden rounded-md bg-muted'
      data-publishing-image-preview=''
      {...positioningAttributes(positionable, positionLabel)}
      style={previewFrameStyle(ratio, thumbnail, fullSize)}
      onPointerDown={positioning.onPointerDown}
      onPointerMove={positioning.onPointerMove}
      onPointerUp={positioning.onPointerEnd}
      onPointerCancel={positioning.onPointerEnd}
      onKeyDown={positioning.onKeyDown}
    >
      <PublishedImage item={item} src={src} imageStyle={imageStyle} onSize={setSize} />
      {!thumbnail && showUserTags && <ImageTagMarkers tags={item.userTags} />}
    </div>
  )
}
