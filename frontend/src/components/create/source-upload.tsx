'use client'

import {
  CheckCircle2,
  FileVideo,
  Loader2,
  RefreshCw,
  Upload,
  X
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'

import { extractApiError } from '@/lib/api-error'
import { formatBytes, formatDuration } from '@/lib/youtube'

const MAX_FILE_BYTES = 2 * 1024 ** 3
const ACCEPTED_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm'
]
const ACCEPTED_EXTENSIONS = /\.(mp4|mov|avi|mkv|webm)$/i

interface UploadedFile {
  name: string
  size: number
  duration: number | null
  filePath: string
}

interface SourceUploadProps {
  uploaded: UploadedFile | null
  onUploaded: (file: UploadedFile | null) => void
  onError: (message: string) => void
}

type UploadPhase =
  | { status: 'idle' }
  | { status: 'uploading'; percent: number; name: string; size: number }

/** Read video duration locally without uploading; null if the browser can't parse it. */
function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const cleanup = (value: number | null) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () =>
      cleanup(Number.isFinite(video.duration) ? video.duration : null)
    video.onerror = () => cleanup(null)
    video.src = url
  })
}

export function SourceUpload({
  uploaded,
  onUploaded,
  onError
}: SourceUploadProps) {
  const t = useTranslations('create')
  const [phase, setPhase] = useState<UploadPhase>({ status: 'idle' })
  const [dragActive, setDragActive] = useState(false)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const startUpload = useCallback(
    async (file: File) => {
      if (
        !ACCEPTED_TYPES.includes(file.type) &&
        !ACCEPTED_EXTENSIONS.test(file.name)
      ) {
        onError(t('unsupportedFileType'))
        return
      }
      if (file.size > MAX_FILE_BYTES) {
        onError(t('fileTooLarge'))
        return
      }

      const duration = await probeDuration(file)
      setPhase({
        status: 'uploading',
        percent: 0,
        name: file.name,
        size: file.size
      })

      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr
      xhr.open('POST', '/api/upload')
      xhr.responseType = 'json'

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setPhase({
            status: 'uploading',
            percent: Math.round((e.loaded / e.total) * 100),
            name: file.name,
            size: file.size
          })
        }
      }

      xhr.onload = () => {
        xhrRef.current = null
        const data: Record<string, unknown> =
          xhr.response && typeof xhr.response === 'object' ? xhr.response : {}
        if (xhr.status >= 200 && xhr.status < 300) {
          const filePath = typeof data.file_path === 'string' ? data.file_path : ''
          if (!filePath) {
            setPhase({ status: 'idle' })
            onError(t('uploadFailed'))
            return
          }
          setPhase({ status: 'idle' })
          onUploaded({ name: file.name, size: file.size, duration, filePath })
        } else {
          setPhase({ status: 'idle' })
          onError(extractApiError(data, t('uploadFailed')))
        }
      }

      xhr.onerror = () => {
        xhrRef.current = null
        setPhase({ status: 'idle' })
        onError(t('uploadFailed'))
      }

      xhr.onabort = () => {
        xhrRef.current = null
        setPhase({ status: 'idle' })
      }

      const formData = new FormData()
      formData.set('file', file)
      xhr.send(formData)
    },
    [onError, onUploaded, t]
  )

  const cancelUpload = useCallback(() => {
    xhrRef.current?.abort()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      if (phase.status === 'uploading') return
      const file = e.dataTransfer.files?.[0]
      if (file) void startUpload(file)
    },
    [phase.status, startUpload]
  )

  if (uploaded) {
    return (
      <div className="animate-scale-in rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/10">
            <FileVideo className="h-5 w-5 text-success" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">
              {uploaded.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatBytes(uploaded.size)}
              {uploaded.duration !== null &&
                ` · ${formatDuration(uploaded.duration)}`}
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-[11px] font-medium text-success">
              <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
              {t('videoUploaded')}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              title={t('replaceFile')}
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onUploaded(null)}
              title={t('removeFile')}
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void startUpload(file)
          }}
        />
      </div>
    )
  }

  if (phase.status === 'uploading') {
    return (
      <div className="animate-scale-in rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Loader2
              className="h-5 w-5 animate-spin text-primary"
              strokeWidth={1.75}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-[13px] font-semibold text-foreground">
                {phase.name}
              </p>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
                {phase.percent}%
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('uploading')} · {formatBytes(phase.size)}
            </p>
            <div className="progress-bar mt-2.5 h-1.5">
              <div
                className="progress-bar-fill"
                style={{ width: `${phase.percent}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={cancelUpload}
            title={t('cancelUpload')}
            className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all animate-scale-in ${
        dragActive
          ? 'border-primary bg-primary/10 scale-[1.01]'
          : 'border-border bg-card/30 hover:border-primary/60 hover:bg-primary/5'
      }`}
    >
      <input
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void startUpload(file)
        }}
      />
      <div
        className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
          dragActive ? 'bg-primary/20' : 'bg-primary/10'
        }`}
      >
        <Upload className="h-6 w-6 text-primary" strokeWidth={1.75} />
      </div>
      <span className="text-sm font-semibold text-foreground">
        {dragActive ? t('dropToUpload') : t('dropOrChoose')}
      </span>
      <span className="mt-1.5 text-xs text-muted-foreground">
        {t('fileTypes')}
      </span>
    </label>
  )
}
