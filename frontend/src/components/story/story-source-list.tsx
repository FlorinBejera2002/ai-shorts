import { Fragment, useEffect, useRef } from 'react'
import { useStoryLanguage } from './use-story-language'
import { useSourceReorder } from './use-source-reorder'
import { type SourceSequenceEntry, reorderSequence } from './story-source-reorder'
import { type SourceRow, sourceRowName } from './story-source-model'
import { SourceRowItem } from './story-source-row'
import styles from './story-sources.module.css'

interface Props {
  rows: SourceRow[]
  /** Saved assets come first in `rows`; only those can be reordered. */
  assetCount: number
  reorderable: boolean
  locked: boolean
  onMove: (from: number, to: number) => void
  onRemove: (row: SourceRow) => void
  onRetry: (id: string) => void
  onReplace: (id: string) => void
  onMetadata: (id: string, seconds: number) => void
}

/** The footage list. Saved assets reorder through the drop board; pending and refused rows stay below. */
export function SourceList({
  rows,
  assetCount,
  reorderable,
  locked,
  onMove,
  onRemove,
  onRetry,
  onReplace,
  onMetadata
}: Props) {
  const text = useStoryLanguage()
  const listRef = useRef<HTMLOListElement>(null)
  /** Row that takes focus once a removed row leaves the list: the next row, else the previous one. */
  const focusAfterRemoval = useRef<HTMLElement | null>(null)
  const orderKey = rows
    .slice(0, assetCount)
    .map((row) => row.id)
    .join('|')
  const reorder = useSourceReorder({
    count: assetCount,
    enabled: reorderable,
    listRef,
    orderKey,
    onMove
  })

  useEffect(() => {
    const next = focusAfterRemoval.current
    if (!next) return
    focusAfterRemoval.current = null
    const target = next.isConnected
      ? next.querySelector<HTMLElement>('button:not(:disabled)')
      : null
    target?.focus()
  }, [rows])

  function removeRow(row: SourceRow) {
    const element = listRef.current?.querySelector<HTMLElement>(
      `[data-row-id="${row.id}"]`
    )
    focusAfterRemoval.current =
      (element?.nextElementSibling as HTMLElement | null) ??
      (element?.previousElementSibling as HTMLElement | null) ??
      null
    onRemove(row)
  }
  const lift = reorder.lift
  const board: SourceSequenceEntry[] = lift
    ? reorderSequence(assetCount, lift.index, lift.target)
    : Array.from({ length: assetCount }, (_, index) => ({ kind: 'row' as const, index }))
  const liftedRow = lift ? rows[lift.index] : undefined
  const announcement =
    lift && liftedRow
      ? `${sourceRowName(liftedRow)}: ${text(
          `position ${lift.target + 1} of ${assetCount}`,
          `poziția ${lift.target + 1} din ${assetCount}`
        )}`
      : ''

  const renderAsset = (index: number, position: number, lifted = false) => {
    const row = rows[index]
    if (!row) return null
    return (
      <SourceRowItem
        key={row.id}
        row={row}
        position={position}
        first={position === 1}
        lifted={lifted}
        sourceIndex={index}
        grip={reorderable ? reorder.gripHandlers(index) : undefined}
        locked={locked}
        onRemove={() => removeRow(row)}
        onRetry={() => onRetry(row.id)}
        onReplace={() => onReplace(row.id)}
        onMetadata={(seconds) => onMetadata(row.id, seconds)}
      />
    )
  }

  return (
    <>
      <p className={styles.visuallyHidden} aria-live="polite">
        {announcement}
      </p>
      <ol className={styles.list} aria-label={text('Footage order', 'Ordinea filmărilor')} ref={listRef}>
      {board.map((entry, position) =>
        entry.kind === 'row' ? (
          renderAsset(entry.index, position + 1)
        ) : (
          <Fragment key="drop-slot">
            <li className={styles.slotWrap} aria-hidden="true">
              <div className={styles.slot} />
            </li>
            {renderAsset(entry.index, position + 1, true)}
          </Fragment>
        )
      )}
      {rows.slice(assetCount).map((row, offset) => (
        <SourceRowItem
          key={row.id}
          row={row}
          position={assetCount + offset + 1}
          first={assetCount === 0 && offset === 0}
          locked={locked}
          onRemove={() => removeRow(row)}
          onRetry={() => onRetry(row.id)}
          onReplace={() => onReplace(row.id)}
          onMetadata={(seconds) => onMetadata(row.id, seconds)}
        />
      ))}
      </ol>
    </>
  )
}
