import type { StoryAsset } from './types'
import type { PendingUpload } from './use-story-uploads'

/** A file the per-file rules refused. It stays in the list until it is replaced or removed. */
export interface RejectedSource {
  id: string
  file: File
}

/** One line of the footage list: a saved asset, an in-flight upload or a refused file. */
export type SourceRow =
  | { kind: 'asset'; id: string; asset: StoryAsset }
  | { kind: 'upload'; id: string; upload: PendingUpload }
  | { kind: 'rejected'; id: string; file: File }

export type SourceRowState =
  | 'uploaded'
  | 'paused'
  | 'validating'
  | 'uploading'
  | 'waiting'
  | 'failed'
  | 'rejected'

const GIGABYTE = 1024 ** 3

/** Saved assets in order, then pending uploads, then refused files. Uploads already saved as assets are not repeated. */
export function buildSourceRows(
  assets: StoryAsset[],
  uploads: PendingUpload[],
  rejected: RejectedSource[]
): SourceRow[] {
  const savedIDs = new Set(assets.map((asset) => asset.id))
  const pending = uploads.filter(
    (upload) => !savedIDs.has(upload.id) && upload.status !== 'complete'
  )
  return [
    ...[...assets]
      .sort((a, b) => a.order - b.order)
      .map((asset): SourceRow => ({ kind: 'asset', id: asset.id, asset })),
    ...pending.map((upload): SourceRow => ({ kind: 'upload', id: upload.id, upload })),
    ...rejected.map((item): SourceRow => ({ kind: 'rejected', id: item.id, file: item.file }))
  ]
}

export function sourceRowName(row: SourceRow) {
  if (row.kind === 'asset') return row.asset.name
  if (row.kind === 'upload') return row.upload.file.name
  return row.file.name
}

export function sourceRowDuration(row: SourceRow): number | undefined {
  if (row.kind === 'asset') return row.asset.duration
  if (row.kind === 'upload') return row.upload.duration
  return undefined
}

export function sourceRowState(row: SourceRow): SourceRowState {
  if (row.kind === 'asset') return 'uploaded'
  if (row.kind === 'rejected') return 'rejected'
  const { upload } = row
  if (upload.retryAt) return 'paused'
  if (upload.status === 'validating') return 'validating'
  if (upload.status === 'uploading') return 'uploading'
  if (upload.status === 'failed') return 'failed'
  return 'waiting'
}

/** Transfer progress of a pending upload, from 0 to 100. */
export function sourceUploadPercent(upload: PendingUpload) {
  if (upload.file.size <= 0) return 0
  return Math.min(100, Math.round((upload.bytes / upload.file.size) * 100))
}

/** Totals for the header. Refused files are excluded because they will not be sent. */
export function sourceTotals(rows: SourceRow[]) {
  return rows.reduce(
    (totals, row) => {
      if (row.kind === 'rejected') return totals
      if (row.kind === 'asset')
        return { transferred: totals.transferred + row.asset.size, total: totals.total + row.asset.size }
      return {
        transferred: totals.transferred + row.upload.bytes,
        total: totals.total + row.upload.file.size
      }
    },
    { transferred: 0, total: 0 }
  )
}

/** Gigabytes with the given decimal separator, for example "1.8" or "1,8". */
export function formatGigabytes(bytes: number, decimalSeparator = '.', digits = 1) {
  return (bytes / GIGABYTE).toFixed(digits).replace('.', decimalSeparator)
}

export function formatLimitMinutes(seconds: number) {
  return Math.round(seconds / 60)
}
