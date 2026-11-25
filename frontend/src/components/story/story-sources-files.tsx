import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStoryLanguage } from './use-story-language'
import { type SourceRow, formatGigabytes } from './story-source-model'
import { SourceList } from './story-source-list'
import styles from './story-sources.module.css'

interface Props {
  rows: SourceRow[]
  assetCount: number
  transferred: number
  total: number
  locked: boolean
  reorderable: boolean
  hasFailed: boolean
  onAdd: () => void
  onMove: (from: number, to: number) => void
  onRemove: (row: SourceRow) => void
  onRetry: (id?: string) => void
  onReplace: (id: string) => void
  onMetadata: (id: string, seconds: number) => void
}

/** The footage card: count, transfer totals, the reorderable list and the add action. */
export function SourceFilesCard({
  rows,
  assetCount,
  transferred,
  total,
  locked,
  reorderable,
  hasFailed,
  onAdd,
  onMove,
  onRemove,
  onRetry,
  onReplace,
  onMetadata
}: Props) {
  const text = useStoryLanguage()
  const decimal = text('.', ',')
  const progress = total > 0 ? Math.min(100, (transferred / total) * 100) : 0
  const count = rows.length
  const countLabel =
    count === 1 ? text('1 file', '1 filmare') : `${count} ${text('files', 'filmări')}`

  return (
    <section className={styles.card} aria-label={text('Footage', 'Filmări')}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{countLabel}</h2>
        {total > 0 && (
          <span className={styles.cardTotals}>
            {`${formatGigabytes(transferred, decimal)} / ${formatGigabytes(total, decimal)} GB`}
          </span>
        )}
      </div>
      {total > 0 && transferred < total && (
        <div
          className={styles.cardProgress}
          role="progressbar"
          aria-label={text('Bytes transferred', 'Octeți transferați')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className={styles.cardProgressFill} style={{ width: `${progress}%` }} />
        </div>
      )}
      <SourceList
        rows={rows}
        assetCount={assetCount}
        reorderable={reorderable}
        locked={locked}
        onMove={onMove}
        onRemove={onRemove}
        onRetry={(id) => onRetry(id)}
        onReplace={onReplace}
        onMetadata={onMetadata}
      />
      {!locked && (
        <button type="button" className={styles.addButton} onClick={onAdd}>
          <Plus size={16} aria-hidden="true" />
          {text('Add footage', 'Adaugă filmări')}
        </button>
      )}
      {hasFailed && (
        <Button type="button" variant="outline" onClick={() => onRetry()}>
          <RefreshCw aria-hidden="true" />
          {text('Retry failed uploads', 'Reîncearcă încărcările eșuate')}
        </Button>
      )}
    </section>
  )
}
