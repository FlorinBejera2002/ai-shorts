import { useState } from 'react'
import { clampPreviewCenter } from './preview-gesture'
import { LOGO_TARGETS, snapAxis, type SnapGuides } from './preview-snap'
import { usePreviewGesture } from './use-preview-gesture'
import type { BrandKit, BrandKitUpdate, PreviewRatio } from './types'
import styles from './preview-card.module.css'

const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-']

/** The watermark over the preview: drag to move (snapping to the safe zone), pinch or +/- to resize. */
export function LogoPreview({
  kit,
  src,
  label,
  ratio,
  selected,
  update,
  onGuides
}: {
  kit: BrandKit
  src: string
  label: string
  ratio: PreviewRatio
  selected: boolean
  update: BrandKitUpdate
  onGuides: (guides: SnapGuides) => void
}) {
  const [image, setImage] = useState({ width: 1, height: 1 })
  const [frame, setFrame] = useState({ width: 1, height: 1 })
  const [rw = 1, rh = 1] = ratio.split(':').map(Number)
  const fit = Math.min((rw * kit.watermarkSize) / image.width, (rh * kit.watermarkSize) / image.height)
  const width = (image.width * fit) / rw
  const height = (image.height * fit) / rh
  const marginX = (kit.watermarkMargin * Math.min(rw, rh)) / rw
  const marginY = (kit.watermarkMargin * Math.min(rw, rh)) / rh
  const free = kit.watermarkX != null && kit.watermarkY != null
  const x = clampPreviewCenter(
    free ? kit.watermarkX! : kit.watermarkPosition.endsWith('left') ? marginX + width / 2 : 1 - marginX - width / 2,
    width
  )
  const y = clampPreviewCenter(
    free ? kit.watermarkY! : kit.watermarkPosition.startsWith('top') ? marginY + height / 2 : 1 - marginY - height / 2,
    height
  )

  function change(next: { x: number; y: number; size: number }, snap = true) {
    const factor = next.size / kit.watermarkSize
    const w = width * factor
    const h = height * factor
    const snappedX = snap ? snapAxis(next.x, w / 2, LOGO_TARGETS.x) : { value: next.x, guide: null }
    const snappedY = snap ? snapAxis(next.y, h / 2, LOGO_TARGETS.y) : { value: next.y, guide: null }
    onGuides({ x: snappedX.guide, y: snappedY.guide })
    update('watermarkX', clampPreviewCenter(snappedX.value, w))
    update('watermarkY', clampPreviewCenter(snappedY.value, h))
    update('watermarkSize', next.size)
  }

  const gestures = usePreviewGesture({ value: { x, y, size: kit.watermarkSize }, frame, min: 0.01, max: 0.5, onChange: change })
  const box = { left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%,-50%)' }
  return (
    <>
      <img
        src={src}
        alt={label}
        aria-label={label}
        role="button"
        tabIndex={0}
        draggable={false}
        data-brand-logo-preview=""
        onLoad={(event) => setImage({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        {...gestures}
        onPointerDown={(event) => {
          const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
          if (bounds) setFrame({ width: bounds.width, height: bounds.height })
          gestures.onPointerDown(event)
        }}
        onKeyDown={(event) => {
          if (!KEYS.includes(event.key)) return
          event.preventDefault()
          const step = event.shiftKey ? 0.05 : 0.01
          const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
          const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
          const ds = event.key === '-' ? -0.01 : ['+', '='].includes(event.key) ? 0.01 : 0
          change({ x: x + dx, y: y + dy, size: Math.max(0.01, Math.min(0.5, kit.watermarkSize + ds)) }, false)
        }}
        className="absolute touch-none cursor-move select-none rounded-sm focus-visible:outline-2 focus-visible:outline-white"
        style={{ ...box, width: `${width * 100}%`, height: `${height * 100}%`, opacity: kit.watermarkOpacity }}
      />
      {selected && (
        <span
          className={styles.logoSelection}
          aria-hidden="true"
          style={{ ...box, width: `calc(${width * 100}% + 21px)`, height: `calc(${height * 100}% + 21px)` }}
        />
      )}
    </>
  )
}
