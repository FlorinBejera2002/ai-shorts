import { useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import type { StoryAsset, StoryProject } from './types'
import type { PendingUpload } from './use-story-uploads'
import { useStoryLanguage } from './use-story-language'
import { isAcceptedStoryFile } from './story-file-validation'
import {
  type RejectedSource,
  type SourceRow,
  buildSourceRows,
  sourceTotals
} from './story-source-model'
import { SourceDropzone } from './story-sources-dropzone'
import { SourceFilesCard } from './story-sources-files'
import { SourceLimits } from './story-sources-limits'
import styles from './story-sources.module.css'

interface Props {
  assets: StoryAsset[]
  uploads: PendingUpload[]
  limits: StoryProject['limits']
  disabled: boolean
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
  onRetry: (id?: string) => void
  onDuration: (id: string, seconds: number) => void
  onChange: (id: string, changes: Partial<StoryAsset>) => void
  /** Refused files live with the parent so they survive creating the project from this step. */
  refused: RejectedSource[]
  onRefusedChange: (update: (current: RejectedSource[]) => RejectedSource[]) => void
}


/**
 * Footage step: the empty dropzone, or the reorderable footage card with the
 * limits aside on desktop. Files that fail the per-file rules stay in the list
 * as refused rows and raise a toast; accepted files go to the upload queue.
 */
export function StorySources({
  assets,
  uploads,
  limits,
  disabled,
  onAdd,
  onRemove,
  onRetry,
  onDuration,
  onChange,
  refused,
  onRefusedChange
}: Props) {
  const text = useStoryLanguage()
  const addToast = useToast((state) => state.add)
  const input = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | undefined>(undefined)
  const [dragging, setDragging] = useState(false)

  const rows = useMemo(
    () => buildSourceRows(assets, uploads, refused),
    [assets, uploads, refused]
  )
  const assetCount = assets.length
  const totals = sourceTotals(rows)
  const hasFailed = rows.some(
    (row) => row.kind === 'upload' && row.upload.status === 'failed'
  )

  function acceptFiles(files: File[]) {
    if (!files.length) return
    const accepted = files.filter((file) => isAcceptedStoryFile(file, limits))
    const replaced = replacing.current
    replacing.current = undefined
    const additions = files
      .filter((file) => !isAcceptedStoryFile(file, limits))
      .map((file) => ({ id: crypto.randomUUID(), file }))
    onRefusedChange((current) => [
      ...current.filter((item) => item.id !== replaced),
      ...additions
    ])
    for (const { file } of additions)
      addToast(
        'error',
        `${file.name} ${text('does not meet the format limits', 'nu respectă limitele de format')}`
      )
    if (accepted.length) onAdd(accepted)
  }

  function chooseFiles() {
    replacing.current = undefined
    input.current?.click()
  }

  function replaceRefused(id: string) {
    replacing.current = id
    input.current?.click()
  }

  function removeRow(row: SourceRow) {
    if (row.kind === 'rejected')
      onRefusedChange((current) => current.filter((item) => item.id !== row.id))
    else onRemove(row.id)
  }

  /** Moves a saved asset to a new place. The board indexes match the sorted asset order. */
  function moveAsset(from: number, to: number) {
    const row = rows[from]
    // Saved footage always sorts first, so a move while uploads are pending stays inside that range.
    if (row?.kind === 'asset')
      onChange(row.id, { order: Math.min(to, assetCount - 1) })
  }

  return (
    <section
      className={`story-sources ${styles.sources}`}
      role="group"
      aria-label={text('Your recordings', 'Filmările tale')}
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragging(false)
        replacing.current = undefined
        acceptFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <div className={styles.main}>
        {rows.length === 0 && !disabled && (
          <SourceDropzone limits={limits} active={dragging} onChoose={chooseFiles} />
        )}
        {rows.length > 0 && (
          <SourceFilesCard
            rows={rows}
            assetCount={assetCount}
            transferred={totals.transferred}
            total={totals.total}
            locked={disabled}
            reorderable={!disabled}
            hasFailed={hasFailed}
            onAdd={chooseFiles}
            onMove={moveAsset}
            onRemove={removeRow}
            onRetry={onRetry}
            onReplace={replaceRefused}
            onMetadata={onDuration}
          />
        )}
      </div>
      <SourceLimits limits={limits} />
      {!disabled && (
        <input
          ref={input}
          type="file"
          multiple
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
          className="hidden"
          aria-label={text('Upload clips', 'Încarcă filmări')}
          onChange={(event) => {
            acceptFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      )}
    </section>
  )
}
