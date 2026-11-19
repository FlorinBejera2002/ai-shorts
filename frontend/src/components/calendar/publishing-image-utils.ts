import type {
  PublishingImageCrop,
  PublishingMedia
} from '@/lib/content-calendar'

export type PublishingImageFormat = PublishingImageCrop['aspectRatio'] | 'original'

export function publishingImageAspectRatio(format: PublishingImageFormat) {
  if (format === '4:5') return 4 / 5
  if (format === '1.91:1') return 1.91
  return 1
}

/** Coordinates describe position within the available overflow, like object-position. */
export function publishingImageCropGeometry(
  width: number,
  height: number,
  crop: PublishingImageCrop
) {
  const ratio = publishingImageAspectRatio(crop.aspectRatio)
  const cropWidth = Math.min(width, height * ratio) / crop.zoom
  const cropHeight = cropWidth / ratio
  return {
    width: cropWidth,
    height: cropHeight,
    left: (width - cropWidth) * crop.x,
    top: (height - cropHeight) * crop.y
  }
}

export function publishingImageCropStyle(
  width: number,
  height: number,
  crop: PublishingImageCrop
) {
  const geometry = publishingImageCropGeometry(width, height, crop)
  return {
    width: `${width / geometry.width * 100}%`,
    height: `${height / geometry.height * 100}%`,
    left: `${-geometry.left / geometry.width * 100}%`,
    top: `${-geometry.top / geometry.height * 100}%`
  }
}

export function applyPublishingImageFormat(
  media: PublishingMedia[],
  format: PublishingImageFormat
) {
  return media.map(item => {
    if (item.type !== 'image') return item
    const { crop, ...original } = item
    if (format === 'original') return original
    return {
      ...item,
      crop: { x: 0.5, y: 0.5, zoom: 1, ...crop, aspectRatio: format }
    }
  })
}

export function publishingImageFormatsMatch(media: PublishingMedia[]) {
  const formats = new Set(media
    .filter(item => item.type === 'image')
    .map(item => item.crop?.aspectRatio ?? 'original')
  )
  return formats.size <= 1
}

export type PublishingImageDrag = {
  /** Pointer movement in rendered pixels since the drag started (or one keyboard step). */
  dx: number
  dy: number
  frameWidth: number
  frameHeight: number
  sourceWidth: number
  sourceHeight: number
}

/**
 * Moves the crop position with the pointer. Crop coordinates describe the position within the
 * overflow, so the rendered image moves by -x * overflow and dragging by dx changes x by -dx / overflow.
 */
export function publishingImageDragCrop(crop: PublishingImageCrop, drag: PublishingImageDrag): PublishingImageCrop {
  const geometry = publishingImageCropGeometry(drag.sourceWidth, drag.sourceHeight, crop)
  const overflowX = drag.frameWidth * (drag.sourceWidth / geometry.width) - drag.frameWidth
  const overflowY = drag.frameHeight * (drag.sourceHeight / geometry.height) - drag.frameHeight
  return {
    ...crop,
    x: clampUnit(overflowX > 0 ? crop.x - drag.dx / overflowX : crop.x),
    y: clampUnit(overflowY > 0 ? crop.y - drag.dy / overflowY : crop.y)
  }
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value))
}
