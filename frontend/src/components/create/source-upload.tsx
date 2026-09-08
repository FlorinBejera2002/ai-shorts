'use client'

import { apiFetch, authClient } from '@/lib/auth'

import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

import {
  CheckCircle2,
  FileVideo,
  Loader2,
  RefreshCw,
  Upload,
  X
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

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
  onBusyChange?: (busy: boolean) => void
}

type UploadPhase =
  | { status: 'idle' }
  | { status: 'uploading'; percent: number; name: string; size: number }

/** Read video duration locally without uploading; null if the browser can't parse it. */
function probeDuration(
  file: File,
  signal: AbortSignal
): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    const cleanup = (value: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const abort = () => cleanup(null)
    const timer = setTimeout(abort, 5000)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
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
  onError,
  onBusyChange
}: SourceUploadProps) {
  const t = useTranslations('create')
  const [phase, setPhase] = useState<UploadPhase>({ status: 'idle' })
  const [dragActive, setDragActive] = useState(false)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const preparationRef = useRef<AbortController | null>(null)
  useEffect(() => {
    onBusyChange?.(phase.status === 'uploading')
    return () => onBusyChange?.(false)
  }, [phase.status, onBusyChange])

  useEffect(
    () => () => {
      preparationRef.current?.abort()
      xhrRef.current?.abort()
    },
    []
  )

  const startUpload = useCallback(
    async (file: File) => {
      if (preparationRef.current) return
      if (
        !ACCEPTED_TYPES.includes(file.type) &&
        !ACCEPTED_EXTENSIONS.test(file.name)
      ) {
        onError(t('unsupportedFileType'))
        return
      }
      if (file.size === 0 || file.size > MAX_FILE_BYTES) {
        onError(t('fileTooLarge'))
        return
      }

      const controller = new AbortController()
      preparationRef.current = controller
      setPhase({
        status: 'uploading',
        percent: 0,
        name: file.name,
        size: file.size
      })
      const finish = () => {
        if (preparationRef.current !== controller) return
        preparationRef.current = null
        xhrRef.current = null
        setPhase({ status: 'idle' })
      }
      const duration = await probeDuration(file, controller.signal)
      if (controller.signal.aborted) return
      let authorization: { uploadUrl: string; token: string | null }
      try {
        const response = await apiFetch('/api/upload/authorize', {
          method: 'POST',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000)
          ]),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || 'application/octet-stream'
          })
        })
        const data = (await response.json()) as Record<string, unknown>
        if (controller.signal.aborted) return
        if (
          !response.ok ||
          typeof data.uploadUrl !== 'string' ||
          (data.token !== null && typeof data.token !== 'string')
        ) {
          finish()
          onError(extractApiError(data, t('uploadFailed')))
          return
        }
        authorization = {
          uploadUrl: data.uploadUrl,
          token: data.token as string | null
        }
      } catch {
        if (controller.signal.aborted) return
        finish()
        onError(t('uploadFailed'))
        return
      }

      setPhase({
        status: 'uploading',
        percent: 0,
        name: file.name,
        size: file.size
      })

      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr
      const directUpload = Boolean(authorization.token)
      xhr.open(
        directUpload ? 'PUT' : 'POST',
        directUpload ? authorization.uploadUrl : authClient.url('/api/upload')
      )
      xhr.withCredentials = true
      if (!directUpload)
        xhr.setRequestHeader(
          'Authorization',
          `Bearer ${authClient.getAccessToken() ?? ''}`
        )
      xhr.timeout = 30 * 60 * 1000
      xhr.responseType = 'json'
      if (authorization.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${authorization.token}`)
        xhr.setRequestHeader(
          'Content-Type',
          file.type || 'application/octet-stream'
        )
      }

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
        if (controller.signal.aborted) return
        finish()
        const data: Record<string, unknown> =
          xhr.response && typeof xhr.response === 'object' ? xhr.response : {}
        if (xhr.status >= 200 && xhr.status < 300) {
          const filePath =
            typeof data.file_path === 'string' ? data.file_path : ''
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
        if (controller.signal.aborted) return
        finish()
        onError(t('uploadFailed'))
      }
      xhr.ontimeout = xhr.onerror

      xhr.onabort = () => {
        finish()
      }

      if (directUpload) {
        xhr.send(file)
      } else {
        const formData = new FormData()
        formData.set('file', file)
        xhr.send(formData)
      }
    },
    [onError, onUploaded, t]
  )

  const cancelUpload = useCallback(() => {
    preparationRef.current?.abort()
    xhrRef.current?.abort()
    preparationRef.current = null
    xhrRef.current = null
    setPhase({ status: 'idle' })
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

  if (uploaded && phase.status === 'idle') {
    return (
      <div className="animate-scale-in">
        <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success/5 p-4 sm:gap-4">
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
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onUploaded(null)}
              title={t('removeFile')}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
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
      <div className="animate-scale-in">
        <Card className="block gap-0 py-0 flex items-center gap-3 p-4 sm:gap-4">
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
            className="shrink-0 rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </Card>
      </div>
    )
  }

  return (
    <Label
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all animate-scale-in sm:min-h-64 sm:p-8 ${
        dragActive
          ? 'border-primary bg-primary/10 scale-[1.01]'
          : 'border-border bg-muted/35 hover:border-primary/60 hover:bg-primary/5'
      }`}
    >
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
    </Label>
  )
}
