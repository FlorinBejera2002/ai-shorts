import { useRef, useState } from 'react'
import { Check, FileVideo, RefreshCw, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatBytes, formatDuration } from '@/lib/youtube'
import type { StoryAsset, StoryProject } from './types'
import type { PendingUpload } from './use-story-uploads'
import { useStoryLanguage } from './use-story-language'

interface Props {
  assets: StoryAsset[]
  uploads: PendingUpload[]
  limits: StoryProject['limits']
  disabled: boolean
  narration?: boolean
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
  onRetry: (id?: string) => void
  onDuration: (id: string, seconds: number) => void
  onChange: (id: string, changes: Partial<StoryAsset>) => void
}

export function StorySources({
  assets,
  uploads,
  limits,
  disabled,
  narration = false,
  onAdd,
  onRemove,
  onRetry,
  onDuration,
  onChange
}: Props) {
  const text = useStoryLanguage()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const ids = new Set(assets.map((asset) => asset.id))
  const pending = uploads.filter(
    (upload) => !ids.has(upload.id) && upload.status !== 'complete'
  )
  const duplicates = uploads.filter(
    (upload) => !ids.has(upload.id) && upload.status === 'complete'
  ).length
  const total =
    assets.reduce((sum, asset) => sum + asset.size, 0) +
    pending.reduce((sum, upload) => sum + upload.file.size, 0)
  const transferred =
    assets.reduce((sum, asset) => sum + asset.size, 0) +
    pending.reduce((sum, upload) => sum + upload.bytes, 0)
  const hasFailed = pending.some((upload) => upload.status === 'failed')
  const uploading = pending.some((upload) =>
    ['queued', 'uploading', 'validating'].includes(upload.status)
  )
  return (
    <Card className="block space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{text('Your recordings', 'Filmările tale')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {narration
              ? text(
                  'Choose the footage for your narration. Original video sound will be muted.',
                  'Alege imaginile pentru narațiune. Sunetul original al filmărilor va fi oprit.'
                )
              : text(
                  'Ideas, alternate takes, and supporting footage — together in one story.',
                  'Idei, duble alternative și imagini de susținere — împreună într-o poveste.'
                )}
          </p>
        </div>
        <span className="rounded-sm bg-muted px-2 py-1 text-xs tabular-nums">
          {assets.length + pending.length} / {limits.max_files}
        </span>
      </div>
      {!disabled && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={assets.length + pending.length >= limits.max_files}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              onAdd(Array.from(event.dataTransfer.files))
            }}
            className={`flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed p-5 text-center transition-colors hover:bg-muted disabled:opacity-50 ${dragging ? 'border-foreground bg-muted' : 'border-border'}`}
          >
            <Upload className="size-6" />
            <span className="text-sm font-medium">
              {text(
                'Drop clips or choose from your gallery',
                'Trage clipuri aici sau alege din galerie'
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {text(
                'MP4, MOV, WebM, MKV · Multiple files',
                'MP4, MOV, WebM, MKV · Fișiere multiple'
              )}
            </span>
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
            className="hidden"
            aria-label={text('Upload story clips', 'Încarcă filmări pentru poveste')}
            onChange={(event) => {
              onAdd(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {text('Limits', 'Limite')}: {formatBytes(limits.max_file_bytes)} /{' '}
        {text('file', 'fișier')} · {formatDuration(limits.max_source_seconds)} /{' '}
        {text('clip', 'clip')} · {formatBytes(limits.max_total_bytes)} /{' '}
        {formatDuration(limits.max_total_seconds)} {text('total', 'total')}
      </p>
      {uploading && (
        <div aria-live="polite" className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <span>
              {text('Transferred', 'Transferat')}: {formatBytes(transferred)} /{' '}
              {formatBytes(total)}
            </span>
            <span>
              {text('Validated', 'Validate')}: {assets.length}
            </span>
          </div>
          <progress
            className="h-1.5 w-full accent-foreground"
            max={Math.max(total, 1)}
            value={transferred}
            aria-label={text('Bytes transferred', 'Octeți transferați')}
          />
          <p>
            {text(
              'Files are ready only after the server finishes validation.',
              'Fișierele sunt pregătite numai după validarea pe server.'
            )}
          </p>
        </div>
      )}
      <ul className="space-y-3">
        {assets.map((asset, assetIndex) => (
          <li
            key={asset.id}
            data-testid="validated-source"
            className="rounded-md border p-3"
          >
            <div className="flex items-center gap-3">
              <SourceThumbnail
                asset={asset}
                localPreview={uploads.find((upload) => upload.id === asset.id)?.preview}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={asset.name}>
                  {asset.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(asset.duration)} · {formatBytes(asset.size)}
                </p>
              </div>
              <Check
                className="size-4 shrink-0"
                aria-label={text('Validated', 'Validat')}
              />
              {!disabled && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${text('Remove', 'Elimină')} ${asset.name}`}
                  onClick={() => onRemove(asset.id)}
                >
                  <X />
                </Button>
              )}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="min-w-0 text-xs">
                <span className="mb-1 block text-muted-foreground">
                  {text('Role', 'Rol')}
                </span>
                <select
                  aria-label={`${text('Role', 'Rol')} ${asset.name}`}
                  className="story-select"
                  disabled={disabled}
                  value={asset.role || 'auto'}
                  onChange={(event) => onChange(asset.id, { role: event.target.value })}
                >
                  {[
                    ['auto', text('Automatic', 'Automat')],
                    ['a_roll', 'A-roll'],
                    ['b_roll', 'B-roll'],
                    ['alternate_take', text('Alternate take', 'Dublă alternativă')],
                    ['reaction', text('Reaction', 'Reacție')],
                    ['transition', text('Transition shot', 'Cadru de tranziție')],
                    [
                      'supporting_visual',
                      text('Supporting visual', 'Imagine de susținere')
                    ],
                    ['low_quality', text('Low quality', 'Calitate redusă')]
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs">
                <span className="mb-1 block text-muted-foreground">
                  {text('Selection', 'Selecție')}
                </span>
                <select
                  aria-label={`${text('Selection', 'Selecție')} ${asset.name}`}
                  className="story-select"
                  disabled={disabled}
                  value={asset.include || 'auto'}
                  onChange={(event) =>
                    onChange(asset.id, { include: event.target.value })
                  }
                >
                  <option value="auto">{text('Let AI choose', 'Alege AI')}</option>
                  <option value="required">
                    {text('Must include', 'Include obligatoriu')}
                  </option>
                  <option value="excluded">{text('Exclude', 'Exclude')}</option>
                </select>
              </label>
              <label className="min-w-0 text-xs">
                <span className="mb-1 block text-muted-foreground">
                  {text('Source order', 'Ordinea surselor')}
                </span>
                <select
                  aria-label={`${text('Order', 'Ordine')} ${asset.name}`}
                  className="story-select"
                  disabled={disabled || uploading}
                  value={assetIndex}
                  onChange={(event) =>
                    onChange(asset.id, { order: Number(event.target.value) })
                  }
                >
                  {assets.map((_, index) => (
                    <option key={index} value={index}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {asset.warnings?.map((warning, index) => (
              <p
                key={`${index}-${warning}`}
                className="mt-2 text-xs text-muted-foreground"
              >
                {warning}
              </p>
            ))}
          </li>
        ))}
        {pending.map((upload) => (
          <li
            key={upload.id}
            className="rounded-md border p-3"
            data-testid="pending-source"
          >
            <div className="flex items-center gap-3">
              <video
                src={upload.preview}
                preload="metadata"
                muted
                playsInline
                aria-hidden="true"
                className="h-14 w-20 shrink-0 rounded-sm bg-muted object-cover"
                onLoadedMetadata={(event) => {
                  if (Number.isFinite(event.currentTarget.duration))
                    onDuration(upload.id, event.currentTarget.duration)
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={upload.file.name}>
                  {upload.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(upload.file.size)}
                  {upload.duration !== undefined &&
                    ` · ${formatDuration(upload.duration)}`}
                </p>
                <p className="mt-1 text-xs" role="status">
                  {upload.status === 'validating'
                    ? text('Validating on server…', 'Validare pe server…')
                    : upload.status === 'failed'
                      ? text('Upload failed', 'Încărcare eșuată')
                      : upload.status === 'queued'
                        ? text('Waiting to upload', 'Așteaptă încărcarea')
                        : `${text('Uploading', 'Se încarcă')} ${Math.round((upload.bytes / upload.file.size) * 100)}%`}
                </p>
              </div>
              {upload.status === 'failed' && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onRetry(upload.id)}
                  aria-label={`${text('Retry', 'Reîncearcă')} ${upload.file.name}`}
                >
                  <RefreshCw />
                </Button>
              )}
              {['queued', 'failed'].includes(upload.status) && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onRemove(upload.id)}
                  aria-label={`${text('Remove', 'Elimină')} ${upload.file.name}`}
                >
                  <X />
                </Button>
              )}
            </div>
            {upload.error && (
              <p role="alert" className="mt-2 break-words text-xs text-destructive">
                {upload.error}
              </p>
            )}
          </li>
        ))}
      </ul>
      {hasFailed && (
        <Button type="button" variant="outline" onClick={() => onRetry()}>
          <RefreshCw />
          {text('Retry failed uploads', 'Reîncearcă încărcările eșuate')}
        </Button>
      )}
      {duplicates > 0 && (
        <p role="status" className="text-xs text-muted-foreground">
          {text(
            'Identical source files were already in this project and were kept once.',
            'Fișierele sursă identice existau deja în proiect și au fost păstrate o singură dată.'
          )}
        </p>
      )}
      {assets.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {text(
            'Originals stay in this project, including unused takes. After reloading, reselect only files that did not finish uploading.',
            'Originalele rămân în proiect, inclusiv dublele neutilizate. După reîncărcare, selectează din nou numai fișierele neterminate.'
          )}
        </p>
      )}
    </Card>
  )
}

function SourceThumbnail({
  asset,
  localPreview
}: {
  asset: StoryAsset
  localPreview?: string
}) {
  const source = localPreview || asset.source_url
  const [failed, setFailed] = useState<string>()
  if (asset.thumbnail_url)
    return (
      <img
        src={asset.thumbnail_url}
        alt=""
        className="h-14 w-20 shrink-0 rounded-sm object-cover"
      />
    )
  if (source && failed !== source)
    return (
      <video
        src={source}
        preload="metadata"
        muted
        playsInline
        aria-hidden="true"
        className="h-14 w-20 shrink-0 rounded-sm bg-muted object-cover"
        onError={() => setFailed(source)}
      />
    )
  return (
    <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-sm bg-muted">
      <FileVideo className="size-6 text-muted-foreground" />
    </div>
  )
}
