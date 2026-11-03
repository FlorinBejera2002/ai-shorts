'use client'

import type { PublishingImageUserTag, PublishingMedia } from '@/lib/content-calendar'
import { type CSSProperties, useState } from 'react'
import {
  publishingImageAspectRatio,
  publishingImageCropStyle
} from './publishing-image-utils'

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

function ImageTagMarkers({ tags = [] }: { tags?: PublishingImageUserTag[] }) {
  return tags.map((tag, index) => (
    <span
      key={tag.username}
      title={tag.username}
      className="absolute flex size-5 items-center justify-center rounded-full border border-background bg-foreground text-[10px] text-background shadow-sm"
      style={{
        left: `clamp(10px, ${tag.x * 100}%, calc(100% - 10px))`,
        top: `clamp(10px, ${tag.y * 100}%, calc(100% - 10px))`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <span aria-hidden="true">{index + 1}</span>
      <span className="sr-only">{tag.username}</span>
    </span>
  ))
}

export function PublishingImagePreview({
  item,
  src,
  thumbnail = false,
  fullSize = false,
  showUserTags = true
}: {
  item: PublishingMedia
  src: string
  thumbnail?: boolean
  fullSize?: boolean
  showUserTags?: boolean
}) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const loaded = size.width > 0 && size.height > 0
  const originalRatio = loaded ? size.width / size.height : 1
  const ratio = item.crop
    ? publishingImageAspectRatio(item.crop.aspectRatio)
    : originalRatio
  const imageStyle = item.crop && loaded
    ? publishingImageCropStyle(size.width, size.height, item.crop)
    : undefined

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-md bg-muted"
      data-publishing-image-preview=""
      style={previewFrameStyle(ratio, thumbnail, fullSize)}
    >
      <img
        src={src}
        alt={item.altText || item.name}
        draggable={false}
        onLoad={event => {
          const { naturalWidth: width, naturalHeight: height } =
            event.currentTarget
          setSize({ width, height })
        }}
        className="absolute max-w-none object-contain"
        style={imageStyle ?? { width: '100%', height: '100%', left: 0, top: 0 }}
      />
      {!thumbnail && showUserTags && <ImageTagMarkers tags={item.userTags} />}
    </div>
  )
}
