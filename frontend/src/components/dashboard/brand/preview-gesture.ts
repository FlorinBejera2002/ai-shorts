export type PreviewTransform = { x: number; y: number; size: number }
export type PreviewPoint = { x: number; y: number }
export type PreviewGesture = {
  transform: PreviewTransform
  center: PreviewPoint
  distance: number
}

export function previewPointerGeometry(points: PreviewPoint[]) {
  const first = points[0] ?? { x: 0, y: 0 }
  const second = points[1] ?? first
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(first.x - second.x, first.y - second.y)
  }
}

export function transformPreviewGesture(
  start: PreviewGesture,
  points: PreviewPoint[],
  frame: { width: number; height: number },
  limits: { min: number; max: number }
): PreviewTransform {
  const current = previewPointerGeometry(points)
  const factor =
    start.distance > 0 && points.length > 1
      ? current.distance / start.distance
      : 1
  return {
    x:
      start.transform.x +
      (current.center.x - start.center.x) / Math.max(1, frame.width),
    y:
      start.transform.y +
      (current.center.y - start.center.y) / Math.max(1, frame.height),
    size: Math.max(
      limits.min,
      Math.min(limits.max, start.transform.size * factor)
    )
  }
}

export function clampPreviewCenter(value: number, extent: number, margin = 0) {
  const half = Math.min(0.5, Math.max(0, extent / 2 + margin))
  return Math.max(half, Math.min(1 - half, value))
}
