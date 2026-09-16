'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { apiFetch } from '@/lib/auth'
import type { PublishingMedia } from '@/lib/content-calendar'
import { Reorder } from 'framer-motion'
import { ImagePlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { PublishingMediaItem } from './publishing-media-item'
import {
  MAX_PUBLISHING_MEDIA,
  PUBLISHING_FILE_ACCEPT,
  movePublishingMedia,
  publishingFileType,
  publishingUploadErrorKey,
  uploadPublishingFile
} from './publishing-media-utils'

export function PublishingMediaPicker({
  media,
  disabled,
  error,
  onChange,
  onError,
  onUploadingChange
}: {
  media: PublishingMedia[]
  disabled: boolean
  error?: string
  onChange: (media: PublishingMedia[]) => void
  onError: (message?: string) => void
  onUploadingChange: (uploading: boolean) => void
}) {
  const t = useTranslations('contentCalendar')
  const inputId = useId()
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<{
    current: number
    total: number
  } | null>(null)
  const previewUrls = useRef<Record<string, string>>({})
  const controller = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      controller.current?.abort()
      for (const url of Object.values(previewUrls.current)) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      }
    },
    []
  )

  useEffect(() => {
    const request = new AbortController()
    for (const item of media) {
      if (previewUrls.current[item.reference]) continue
      void apiFetch(
        `/api/publishing/media/preview?reference=${encodeURIComponent(item.reference)}`,
        { signal: request.signal }
      )
        .then(async (response) => {
          if (!response.ok) return
          const result = (await response.json()) as { url: string }
          if (request.signal.aborted) return
          previewUrls.current[item.reference] = result.url
          setPreviews({ ...previewUrls.current })
        })
        .catch(() => {
          /* Keep the filename visible when a preview cannot be loaded. */
        })
    }
    return () => request.abort()
  }, [media])

  async function upload(files: File[]) {
    if (!files.length || disabled || controller.current) return
    if (media.length + files.length > MAX_PUBLISHING_MEDIA) {
      onError(t('validation.mediaInvalid'))
      return
    }
    const unsupported = files.find((file) => !publishingFileType(file))
    if (unsupported) {
      onError(`${unsupported.name}: ${t('validation.mediaUnsupported')}`)
      return
    }
    const request = new AbortController()
    controller.current = request
    onUploadingChange(true)
    onError(undefined)
    const uploaded = [...media]
    const failures: string[] = []
    try {
      // Bound memory and connections on mobile; keep successful files if one fails.
      for (const [index, file] of files.entries()) {
        setProgress({ current: index + 1, total: files.length })
        try {
          const item = await uploadPublishingFile(
            file,
            apiFetch,
            request.signal
          )
          if (request.signal.aborted) return
          previewUrls.current[item.reference] = URL.createObjectURL(file)
          setPreviews({ ...previewUrls.current })
          uploaded.push(item)
          onChange([...uploaded])
        } catch (cause) {
          if (request.signal.aborted) return
          const key = publishingUploadErrorKey(cause)
          failures.push(`${file.name}: ${t(`validation.${key}`)}`)
        }
      }
      if (failures.length) onError(failures.join('\n'))
    } finally {
      controller.current = null
      if (!request.signal.aborted) {
        setProgress(null)
        onUploadingChange(false)
      }
    }
  }

  function remove(reference: string) {
    if (disabled) return
    const url = previewUrls.current[reference]
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    delete previewUrls.current[reference]
    setPreviews({ ...previewUrls.current })
    onChange(media.filter((item) => item.reference !== reference))
  }

  return (
    <div className="pt-1">
      <label
        htmlFor={inputId}
        className="text-xs font-semibold text-foreground"
      >
        {t('form.mediaLabel')}
      </label>
      <label
        className={`relative mt-2 flex min-h-20 items-center gap-3 rounded-md border border-border bg-card px-4 py-3 focus-within:ring-2 focus-within:ring-foreground ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
      >
        <input
          id={inputId}
          type="file"
          accept={PUBLISHING_FILE_ACCEPT}
          multiple={true}
          disabled={disabled || media.length >= MAX_PUBLISHING_MEDIA}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            void upload(files)
          }}
        />
        {progress ? (
          <LoadingIndicator className="size-5 shrink-0" />
        ) : (
          <ImagePlus className="size-5 shrink-0" />
        )}
        <span className="min-w-0">
          <span className="block text-xs font-semibold" role="status">
            {progress
              ? t('form.mediaProgress', progress)
              : media.length
                ? t('form.mediaAdd')
                : t('form.mediaChoose')}
          </span>
          <span
            id={`${inputId}-hint`}
            className="mt-1 block text-[11px] leading-5 text-muted-foreground"
          >
            {t('form.mediaHint')}
          </span>
        </span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {media.length}/{MAX_PUBLISHING_MEDIA}
        </span>
      </label>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        {t('form.mediaQualityHint')}
      </p>
      {media.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] text-muted-foreground">
            {t('form.mediaOrderHint')}
          </p>
          <Reorder.Group
            axis="y"
            values={media}
            onReorder={(items) => {
              if (!disabled) onChange(items)
            }}
            className="space-y-2"
            aria-label={t('form.mediaOrder')}
          >
            {media.map((item, index) => (
              <PublishingMediaItem
                key={item.reference}
                item={item}
                index={index}
                count={media.length}
                previewUrl={previews[item.reference]}
                disabled={disabled}
                onRemove={remove}
                onMove={(reference, target) => {
                  if (!disabled)
                    onChange(movePublishingMedia(media, reference, target))
                }}
              />
            ))}
          </Reorder.Group>
        </div>
      )}
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-2 whitespace-pre-line text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
