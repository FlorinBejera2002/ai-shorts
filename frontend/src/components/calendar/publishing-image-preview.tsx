'use client'

import type { PublishingMedia } from '@/lib/content-calendar'
import { useState } from 'react'
import {
  publishingImageAspectRatio,
  publishingImageCropStyle
} from './publishing-image-utils'

export function PublishingImagePreview({
  item,
  src,
  thumbnail = false,
  showUserTags = true
}: {
  item: PublishingMedia
  src: string
  thumbnail?: boolean
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
      style={{
        aspectRatio: ratio,
        width: thumbnail && ratio < 1 ? undefined : '100%',
        height: thumbnail && ratio < 1 ? '100%' : undefined,
        maxWidth: thumbnail ? undefined : `${20 * ratio}rem`
      }}
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
      {!thumbnail && showUserTags && item.userTags?.map((tag, index) => (
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
      ))}
    </div>
  )
}
