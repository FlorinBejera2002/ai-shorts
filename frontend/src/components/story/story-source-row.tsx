import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { AlertTriangle, Check, GripVertical, RefreshCw, X } from 'lucide-react'
import { formatBytes } from '@/lib/youtube'
import { useStoryLanguage } from './use-story-language'
import {
  type SourceRow,
  type SourceRowState,
  sourceRowDuration,
  sourceRowName,
  sourceRowState,
  sourceUploadPercent,
  formatGigabytes
} from './story-source-model'
import { SourceThumb } from './story-source-thumb'
import styles from './story-sources.module.css'

export interface SourceGripHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

interface Props {
  row: SourceRow
  /** 1-based place in the list as shown, including a drop slot while reordering. */
  position: number
  first: boolean
  lifted?: boolean
  /** Index among saved assets; present only for rows that can be reordered. */
  sourceIndex?: number
  /** Handlers for the drag grip, or undefined when this row cannot be moved. */
  grip?: SourceGripHandlers
  /** Removal and cancel are hidden while the project is locked. */
  locked: boolean
  onRemove: () => void
  onRetry: () => void
  onReplace: () => void
  onMetadata: (seconds: number) => void
}

/** Size in GB with a decimal comma in Romanian, or the shared byte formatter below 1 GB. */
function formatSize(bytes: number, text: (en: string, ro: string) => string) {
  if (bytes >= 1024 ** 3) return `${formatGigabytes(bytes, text('.', ','))} GB`
  // Megabytes are whole numbers on the canvas ("980 MB").
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return formatBytes(bytes)
}

function rowSize(row: SourceRow) {
  if (row.kind === 'asset') return row.asset.size
  if (row.kind === 'upload') return row.upload.file.size
  return row.file.size
}

/** One footage row: grip, number, thumbnail, name, size, status and actions. */
export function SourceRowItem({
  row,
  position,
  first,
  lifted = false,
  sourceIndex,
  grip,
  locked,
  onRemove,
  onRetry,
  onReplace,
  onMetadata
}: Props) {
  const text = useStoryLanguage()
  const name = sourceRowName(row)
  const state = sourceRowState(row)
  const thumbURL = row.kind === 'asset' ? row.asset.thumbnail_url : undefined
  const videoURL = rowVideoURL(row)

  return (
    <li
      data-testid={rowTestID(row)}
      data-row-id={row.id}
      data-first={first ? 'true' : 'false'}
      data-lifted={lifted ? 'true' : 'false'}
      data-dimmed={state === 'waiting' ? 'true' : 'false'}
      data-source-index={sourceIndex}
      className={styles.row}
    >
      <button
        type="button"
        data-source-grip
        className={styles.grip}
        disabled={!grip}
        aria-label={`${text('Drag to move', 'Trage pentru a muta')} ${name}`}
        {...grip}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <span className={styles.number} aria-hidden="true">
        {position}
      </span>
      <SourceThumb
        thumbnailURL={thumbURL}
        videoURL={videoURL}
        duration={sourceRowDuration(row)}
        onMetadata={row.kind === 'upload' ? onMetadata : undefined}
      />
      <RowBody row={row} name={name} state={state} onReplace={onReplace} />
      <RowActions
        row={row}
        name={name}
        state={state}
        locked={locked}
        onRetry={onRetry}
        onRemove={onRemove}
      />
    </li>
  )
}

function rowTestID(row: SourceRow) {
  if (row.kind === 'asset') return 'validated-source'
  return row.kind === 'upload' ? 'pending-source' : 'rejected-source'
}

/** Video used for the thumbnail fallback and the metadata probe: the stored proxy for saved footage. */
function rowVideoURL(row: SourceRow) {
  if (row.kind === 'asset') return row.asset.proxy_url || row.asset.source_url
  if (row.kind === 'upload') return row.upload.preview
  return undefined
}

/** Name, size, status line and any upload error of a row. */
function RowBody({
  row,
  name,
  state,
  onReplace
}: {
  row: SourceRow
  name: string
  state: SourceRowState
  onReplace: () => void
}) {
  const text = useStoryLanguage()
  const size = formatSize(rowSize(row), text)
  return (
    <div className={styles.body}>
      <div className={styles.nameLine}>
        <p className={styles.name} title={name}>
          {name}
        </p>
        <span className={styles.size}>{size}</span>
      </div>
      <div className={styles.statusLine}>
        <span className={styles.mobileSize}>{size}</span>
        <RowStatus row={row} state={state} onReplace={onReplace} />
      </div>
      {row.kind === 'upload' && row.upload.error && (
        <p role="alert" className={styles.rowError}>
          {text(
            'The upload did not finish. Try again.',
            'Încărcarea nu s-a finalizat. Reîncearcă.'
          )}
        </p>
      )}
    </div>
  )
}

/** Icon actions of a row: retry a failed upload, cancel an upload in progress, or remove footage. */
function RowActions({
  row,
  name,
  state,
  locked,
  onRetry,
  onRemove
}: {
  row: SourceRow
  name: string
  state: SourceRowState
  locked: boolean
  onRetry: () => void
  onRemove: () => void
}) {
  const text = useStoryLanguage()
  const showRetry = row.kind === 'upload' && state === 'failed'
  const showCancel = row.kind === 'upload' && row.upload.status !== 'complete'
  const showRemove = (row.kind === 'asset' || row.kind === 'rejected') && !locked
  return (
    <>
      {showRetry && (
        <IconAction
          label={`${text('Retry', 'Reîncearcă')} ${name}`}
          onClick={onRetry}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </IconAction>
      )}
      {showCancel && (
        <IconAction
          label={`${text('Cancel upload', 'Anulează încărcarea')} ${name}`}
          onClick={onRemove}
        >
          <X size={16} aria-hidden="true" />
        </IconAction>
      )}
      {showRemove && (
        <IconAction label={`${text('Remove', 'Elimină')} ${name}`} onClick={onRemove}>
          <X size={16} aria-hidden="true" />
        </IconAction>
      )}
    </>
  )
}

function IconAction({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={styles.iconButton} aria-label={label} onClick={onClick}>
      {children}
    </button>
  )
}

function RowStatus({
  row,
  state,
  onReplace
}: {
  row: SourceRow
  state: SourceRowState
  onReplace: () => void
}) {
  const text = useStoryLanguage()
  switch (state) {
    case 'uploaded':
      return (
        <span className={`${styles.status} ${styles.statusUploaded}`}>
          <Check size={13} strokeWidth={2.5} aria-hidden="true" />
          {text('Uploaded', 'Încărcat')}
        </span>
      )
    case 'uploading': {
      const percent = row.kind === 'upload' ? sourceUploadPercent(row.upload) : 0
      return (
        <span className={styles.statusProgress}>
          <span className={styles.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={text('Upload progress', 'Progresul încărcării')}>
            <span className={styles.progressFill} style={{ width: `${percent}%` }} />
          </span>
          {percent}%
        </span>
      )
    }
    case 'paused': {
      const retryAt = row.kind === 'upload' ? row.upload.retryAt : undefined
      const time = retryAt
        ? new Date(retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : ''
      return (
        <span role="status" className={styles.statusWaiting}>
          {text('Retry at', 'Reîncearcă la')} {time}
        </span>
      )
    }
    case 'validating':
      return (
        <span className={styles.statusWaiting} role="status">
          {text('Validating', 'Se validează')}
        </span>
      )
    case 'failed':
      return (
        <span className={`${styles.status} ${styles.statusError}`}>
          {text('Upload failed', 'Încărcare eșuată')}
        </span>
      )
    case 'rejected':
      // Status and replace link stay together as one unit so they wrap as a pair on narrow rows.
      return (
        <span className={styles.rejectedGroup}>
          <span className={`${styles.status} ${styles.statusError}`}>
            <AlertTriangle size={13} strokeWidth={2.5} aria-hidden="true" />
            {/* Phones use the short status copy (canvas): "Neacceptat". */}
            <span className={styles.desktopOnly}>{text('Unsupported format', 'Format neacceptat')}</span>
            <span className={styles.mobileOnly}>{text('Not accepted', 'Neacceptat')}</span>
          </span>
          <button type="button" className={styles.linkButton} onClick={onReplace}>
            {text('Replace', 'Înlocuiește')}
          </button>
        </span>
      )
    case 'waiting':
      return <span className={styles.statusWaiting}>{text('Waiting', 'În așteptare')}</span>
  }
}
