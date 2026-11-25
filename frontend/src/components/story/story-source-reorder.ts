/** One position in the reorder board: a footage row, or the drop slot that holds the lifted row. */
export type SourceSequenceEntry =
  | { kind: 'row'; index: number }
  | { kind: 'slot'; index: number }

export function clampIndex(index: number, count: number) {
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0))
}

/** Items after one move from `from` to `to`, with the same clamping the order PATCH uses. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return next
  next.splice(clampIndex(to, next.length + 1), 0, moved)
  return next
}

/**
 * Drop index for a pointer at `pointerY`: the number of other rows whose centre
 * lies above it. Centres are measured once when the drag starts, so the drop
 * slot opening up does not move the target back and forth.
 */
export function dropIndexFromCentres(centres: readonly number[], pointerY: number) {
  return centres.filter((centre) => centre < pointerY).length
}

/**
 * The board while `lifted` is held over position `target`: the other rows in
 * order, with a slot inserted at `target` that carries the lifted row.
 */
export function reorderSequence(
  count: number,
  lifted: number,
  target: number
): SourceSequenceEntry[] {
  const others = Array.from({ length: count }, (_, index) => index).filter(
    (index) => index !== lifted
  )
  const position = clampIndex(target, count)
  return [
    ...others.slice(0, position).map((index): SourceSequenceEntry => ({ kind: 'row', index })),
    { kind: 'slot', index: lifted },
    ...others.slice(position).map((index): SourceSequenceEntry => ({ kind: 'row', index }))
  ]
}
