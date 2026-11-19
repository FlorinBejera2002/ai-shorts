import type { KeyboardEvent, RefObject } from 'react'
import { CAPTION_SIZE_RANGE, captionKeyAction, clampCaptionCenter } from './caption-preview-layout'
import type { CaptionStyle } from './caption-style'
import { clampPreviewCenter } from './preview-gesture'
import { usePreviewGesture } from './use-preview-gesture'

type Size = { w: number; h: number }
type Position = CaptionStyle['position']

/**
 * Drag/pinch and keyboard handlers for the preview caption. With `onTransformChange` a pinch also
 * resizes and +/- change the size; with only `onPositionChange` the caption moves and snaps to the middle.
 */
export function useCaptionGestures({
  style,
  frame,
  box,
  caption,
  onPositionChange,
  onTransformChange
}: {
  style: CaptionStyle
  frame: Size
  box: Size
  caption: RefObject<HTMLElement | null>
  onPositionChange?: (position: Position) => void
  onTransformChange?: (position: Position, size: number) => void
}) {
  function move(x: number, y: number, snap = true) {
    const halfW = (caption.current?.offsetWidth ?? 0) / frame.w / 2
    const halfH = (caption.current?.offsetHeight ?? 0) / frame.h / 2
    const snapped = (value: number) => (snap && Math.abs(value - 0.5) < 0.015 ? 0.5 : value)
    onPositionChange?.({ x: clampCaptionCenter(snapped(x), halfW), y: clampCaptionCenter(snapped(y), halfH), anchor: 'center' })
  }

  function transform(next: { x: number; y: number; size: number }) {
    const factor = next.size / style.size
    onTransformChange?.(
      {
        x: clampPreviewCenter(next.x, (box.w * factor) / frame.w, 0.01),
        y: clampPreviewCenter(next.y, (box.h * factor) / frame.h, 0.01),
        anchor: 'center'
      },
      next.size
    )
  }

  const drag = (next: { x: number; y: number }) => move(next.x, next.y)
  const gestures = usePreviewGesture({
    value: { ...style.position, size: style.size },
    frame: { width: frame.w, height: frame.h },
    ...CAPTION_SIZE_RANGE,
    onChange: onTransformChange ? transform : onPositionChange && drag
  })

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const action = captionKeyAction(event.key, event.shiftKey)
    if (!action || ('resize' in action && !onTransformChange)) return
    event.preventDefault()
    if ('resize' in action) {
      const size = Math.max(CAPTION_SIZE_RANGE.min, Math.min(CAPTION_SIZE_RANGE.max, style.size + action.resize))
      onTransformChange?.(style.position, size)
    } else move(style.position.x + action.dx, style.position.y + action.dy, false)
  }

  return { ...gestures, onKeyDown }
}
