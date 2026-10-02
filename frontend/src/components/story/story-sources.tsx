import { useRef, useState } from 'react'
import { Check, FileVideo, RefreshCw, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatBytes, formatDuration } from '@/lib/youtube'
import type { StoryAsset, StoryProject } from './types'
import type { PendingUpload } from './use-story-uploads'
import { useStoryLanguage } from './use-story-language'
import { StoryHelp } from './story-help'

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
    <Card
      className="block space-y-4 p-5"
      role="group"
      aria-label={text('Your recordings', 'Filmările tale')}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          {assets.length + pending.length} / {limits.max_files}{' '}
          {text('clips', 'filmări')}
        </span>
        <StoryHelp label={text('Your recordings', 'Filmările tale')}>
          {narration
            ? text(
                'Choose the footage for your narration. Original video sound will be muted.',
                'Alege imaginile pentru narațiune. Sunetul original al filmărilor va fi oprit.'
              )
            : text(
                'Ideas, alternate takes, and supporting footage — together in one story.',
                'Idei, duble alternative și imagini de susținere — împreună într-o poveste.'
              )}{' '}
          {formatBytes(limits.max_file_bytes)} / {text('file', 'fișier')} ·{' '}
          {formatDuration(limits.max_source_seconds)} / clip ·{' '}
          {formatBytes(limits.max_total_bytes)} /{' '}
          {formatDuration(limits.max_total_seconds)} {text('total', 'total')}.{' '}
          {text(
            'Original files stay in your project.',
            'Fișierele originale rămân în proiect.'
          )}
        </StoryHelp>
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
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed p-5 text-center transition-colors hover:bg-muted disabled:opacity-50 ${assets.length ? 'min-h-24' : 'min-h-36'} ${dragging ? 'border-foreground bg-muted' : 'border-border'}`}
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
            aria-label={text(
              'Upload story clips',
              'Încarcă filmări pentru poveste'
            )}
            onChange={(event) => {
              onAdd(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
        </>
      )}
      {uploading && (
        <div
          aria-live="polite"
          className="space-y-1.5 text-xs text-muted-foreground"
        >
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
          <p>{text('Checking your clips…', 'Verificăm filmările…')}</p>
        </div>
      )}
      <ul className="story-source-grid">
        {assets.map((asset, assetIndex) => (
          <li
            key={asset.id}
            data-testid="validated-source"
            className="rounded-md border p-3"
          >
            <div className="flex items-center gap-3">
              <SourceThumbnail
                asset={asset}
                localPreview={
                  uploads.find((upload) => upload.id === asset.id)?.preview
                }
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
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                {text('Clip preferences', 'Preferințe pentru clip')}
              </summary>
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
                    onChange={(event) =>
                      onChange(asset.id, { role: event.target.value })
                    }
                  >
                    {[
                      ['auto', text('Automatic', 'Automat')],
                      ['a_roll', text('Main footage', 'Filmarea principală')],
                      [
                        'b_roll',
                        text('Illustrative footage', 'Imagini de completare')
                      ],
                      [
                        'alternate_take',
                        text('Alternate take', 'Dublă alternativă')
                      ],
                      ['reaction', text('Reaction', 'Reacție')],
                      [
                        'transition',
                        text('Transition shot', 'Cadru de tranziție')
                      ],
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
                    <option value="auto">
                      {text('Let AI choose', 'Alege AI')}
                    </option>
                    <option value="required">
                      {text('Must include', 'Include obligatoriu')}
                    </option>
                    <option value="excluded">
                      {text('Exclude', 'Exclude')}
                    </option>
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
            </details>
            {Boolean(asset.warnings?.length) && (
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">
                  {text('Analysis details', 'Detalii analiză')}
                </summary>
                {asset.warnings?.map((warning, index) => (
                  <p
                    key={`${index}-${warning}`}
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    {warning}
                  </p>
                ))}
              </details>
            )}
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
                <p
                  className="truncate text-sm font-medium"
                  title={upload.file.name}
                >
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
              <p
                role="alert"
                className="mt-2 break-words text-xs text-destructive"
              >
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
