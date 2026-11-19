/** Safe-zone inset of the preview frame (canvas "Zonă sigură"). */
export const SAFE_INSET = 0.08
export const SNAP_DISTANCE = 0.015

/** Guide lines an element currently snaps to, as fractions of the frame (null = none). */
export type SnapGuides = { x: number | null; y: number | null }
export const NO_GUIDES: SnapGuides = { x: null, y: null }

type AxisTargets = { center?: number[]; start?: number[]; end?: number[] }

/**
 * Moves an element's centre so that its centre or one of its edges sits on the nearest guide
 * within `distance`; returns the snapped centre and the guide it landed on.
 */
export function snapAxis(center: number, half: number, targets: AxisTargets, distance = SNAP_DISTANCE) {
  let best: { value: number; guide: number | null; gap: number } = { value: center, guide: null, gap: distance }
  const consider = (position: number, guide: number, value: number) => {
    const gap = Math.abs(position - guide)
    if (gap <= best.gap) best = { value, guide, gap }
  }
  for (const guide of targets.center ?? []) consider(center, guide, guide)
  for (const guide of targets.start ?? []) consider(center - half, guide, guide + half)
  for (const guide of targets.end ?? []) consider(center + half, guide, guide - half)
  return { value: best.value, guide: best.guide }
}

/** Captions snap their centre to the thirds and the middle of the frame. */
export const CAPTION_TARGETS: Record<'x' | 'y', AxisTargets> = {
  x: { center: [0.5] },
  y: { center: [1 / 3, 0.5, 2 / 3] }
}

/** The logo snaps its edges to the safe zone and its centre to the middle. */
export const LOGO_TARGETS: Record<'x' | 'y', AxisTargets> = {
  x: { center: [0.5], start: [SAFE_INSET], end: [1 - SAFE_INSET] },
  y: { center: [0.5], start: [SAFE_INSET], end: [1 - SAFE_INSET] }
}
