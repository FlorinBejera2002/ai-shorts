import { useState } from 'react'
import { clampPreviewCenter } from './preview-gesture'
import { usePreviewGesture } from './use-preview-gesture'
import type { BrandKit, BrandKitUpdate, PreviewRatio } from './types'

export function LogoPreview({
  kit,
  src,
  label,
  ratio,
  update
}: {
  kit: BrandKit
  src: string
  label: string
  ratio: PreviewRatio
  update: BrandKitUpdate
}) {
  const [image, setImage] = useState({ width: 1, height: 1 })
  const [frame, setFrame] = useState({ width: 1, height: 1 })
  const [rw = 1, rh = 1] = ratio.split(':').map(Number)
  const fit = Math.min(
    (rw * kit.watermarkSize) / image.width,
    (rh * kit.watermarkSize) / image.height
  )
  const width = (image.width * fit) / rw
  const height = (image.height * fit) / rh
  const marginX = (kit.watermarkMargin * Math.min(rw, rh)) / rw
  const marginY = (kit.watermarkMargin * Math.min(rw, rh)) / rh
  const free = kit.watermarkX != null && kit.watermarkY != null
  const x = clampPreviewCenter(
    free
      ? kit.watermarkX!
      : kit.watermarkPosition.endsWith('left')
        ? marginX + width / 2
        : 1 - marginX - width / 2,
    width
  )
  const y = clampPreviewCenter(
    free
      ? kit.watermarkY!
      : kit.watermarkPosition.startsWith('top')
        ? marginY + height / 2
        : 1 - marginY - height / 2,
    height
  )
  const change = (next: { x: number; y: number; size: number }) => {
    const factor = next.size / kit.watermarkSize
    update('watermarkX', clampPreviewCenter(next.x, width * factor))
    update('watermarkY', clampPreviewCenter(next.y, height * factor))
    update('watermarkSize', next.size)
  }
  const gestures = usePreviewGesture({
    value: { x, y, size: kit.watermarkSize },
    frame,
    min: 0.01,
    max: 0.5,
    onChange: change
  })
  return (
    <img
      src={src}
      alt={label}
      aria-label={label}
      role="button"
      tabIndex={0}
      draggable={false}
      onLoad={(event) =>
        setImage({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight
        })
      }
      {...gestures}
      onPointerDown={(event) => {
        const bounds =
          event.currentTarget.parentElement?.getBoundingClientRect()
        if (bounds) setFrame({ width: bounds.width, height: bounds.height })
        gestures.onPointerDown(event)
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.05 : 0.01
        const keys = [
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          '+',
          '=',
          '-'
        ]
        if (!keys.includes(event.key)) return
        event.preventDefault()
        change({
          x:
            x +
            (event.key === 'ArrowLeft'
              ? -step
              : event.key === 'ArrowRight'
                ? step
                : 0),
          y:
            y +
            (event.key === 'ArrowUp'
              ? -step
              : event.key === 'ArrowDown'
                ? step
                : 0),
          size: Math.max(
            0.01,
            Math.min(
              0.5,
              kit.watermarkSize +
                (event.key === '-'
                  ? -0.01
                  : ['+', '='].includes(event.key)
                    ? 0.01
                    : 0)
            )
          )
        })
      }}
      className="absolute touch-none cursor-move select-none rounded-sm outline-dashed outline-1 outline-white/60 focus-visible:ring-2 focus-visible:ring-white"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
        transform: 'translate(-50%,-50%)',
        opacity: kit.watermarkOpacity
      }}
    />
  )
}
