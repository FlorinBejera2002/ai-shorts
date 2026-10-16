import { useRef, type PointerEvent } from 'react'
import {
  previewPointerGeometry,
  transformPreviewGesture,
  type PreviewGesture,
  type PreviewPoint,
  type PreviewTransform
} from './preview-gesture'

/** Pointer capture keeps both fingers attached even when they leave the artwork. */
export function usePreviewGesture({
  value,
  frame,
  min,
  max,
  onChange
}: {
  value: PreviewTransform
  frame: { width: number; height: number }
  min: number
  max: number
  onChange?: (next: PreviewTransform) => void
}) {
  const points = useRef(new Map<number, PreviewPoint>())
  const start = useRef<PreviewGesture | null>(null)
  const current = useRef(value)
  const rebase = () => {
    start.current = points.current.size
      ? {
          transform: current.current,
          ...previewPointerGeometry([...points.current.values()])
        }
      : null
  }
  const finish = (event: PointerEvent<HTMLElement>) => {
    points.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    current.current = value
    rebase()
  }
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!onChange || event.button !== 0 || points.current.size >= 2) return
      event.preventDefault()
      event.stopPropagation()
      if (!points.current.size) current.current = value
      event.currentTarget.setPointerCapture(event.pointerId)
      points.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      })
      rebase()
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!start.current || !points.current.has(event.pointerId)) return
      event.preventDefault()
      points.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      })
      const next = transformPreviewGesture(
        start.current,
        [...points.current.values()],
        frame,
        { min, max }
      )
      current.current = next
      onChange?.(next)
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish
  }
}
