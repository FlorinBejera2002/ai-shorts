'use client'

import { apiFetch } from '@/lib/auth'
import type { PublishingMedia } from '@/lib/content-calendar'
import { Reorder } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { PublishingMediaItem } from './publishing-media-item'
import { PublishingImageFormatSelector } from './publishing-image-format'
import { applyPublishingImageFormat } from './publishing-image-utils'
import {
  MAX_PUBLISHING_MEDIA,
  movePublishingMedia,
  publishingFileType,
  publishingUploadErrorKey,
  uploadPublishingFile
} from './publishing-media-utils'
import { PublishingMediaUploadZone } from './publishing-media-upload-zone'

export function PublishingMediaPicker({
  presentation = 'inline',
  media,
  disabled,
  instagramEnabled = false,
  facebookEnabled = false,
  tiktokEnabled = false,
  error,
  onChange,
  onError,
  onUploadingChange
}: {
  presentation?: 'inline' | 'dialog'
  media: PublishingMedia[]
  disabled: boolean
  instagramEnabled?: boolean
  facebookEnabled?: boolean
  tiktokEnabled?: boolean
  error?: string
  onChange: (media: PublishingMedia[]) => void
  onError: (message?: string) => void
  onUploadingChange: (uploading: boolean) => void
}) {
  const t = useTranslations('contentCalendar')
  const isDialog = presentation === 'dialog'
  const inputId = useId()
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<{
    current: number
    total: number
    filename: string
  } | null>(null)
  const previewUrls = useRef<Record<string, string>>({})
  const controller = useRef<AbortController | null>(null)
  const uploadingCallback = useRef(onUploadingChange)
  const photoEditorEnabled = instagramEnabled || facebookEnabled || tiktokEnabled
  const imageFormat =
    media.find(item => item.type === 'image')?.crop?.aspectRatio ?? 'original'

  useEffect(() => {
    uploadingCallback.current = onUploadingChange
  }, [onUploadingChange])

  useEffect(
    () => () => {
      controller.current?.abort()
      uploadingCallback.current(false)
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
        setProgress({
          current: index + 1,
          total: files.length,
          filename: file.name
        })
        try {
          const item = await uploadPublishingFile(
            file,
            apiFetch,
            request.signal
          )
          if (request.signal.aborted) return
          previewUrls.current[item.reference] = URL.createObjectURL(file)
          setPreviews({ ...previewUrls.current })
          uploaded.push(
            photoEditorEnabled
              ? applyPublishingImageFormat([item], imageFormat)[0]!
              : item
          )
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
    <div className={isDialog ? undefined : 'pt-1'}>
      <label
        htmlFor={inputId}
        className={isDialog ? 'sr-only' : 'text-xs font-semibold text-foreground'}
      >
        {t('form.mediaLabel')}
      </label>
      {photoEditorEnabled && !isDialog && (
        <PublishingImageFormatSelector
          media={media}
          disabled={disabled}
          instagramEnabled={instagramEnabled}
          facebookEnabled={facebookEnabled}
          tiktokEnabled={tiktokEnabled}
          onChange={onChange}
        />
      )}
      <PublishingMediaUploadZone
        presentation={presentation}
        inputId={inputId}
        mediaCount={media.length}
        disabled={disabled}
        error={error}
        progress={progress}
        onUpload={upload}
      />
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
                instagramEnabled={instagramEnabled}
                facebookEnabled={facebookEnabled}
                tiktokEnabled={tiktokEnabled}
                onChange={updated => {
                  if (!disabled) {
                    // Instagram uses one format for its whole carousel. Commit
                    // that format only when the focused editor is confirmed.
                    const formatted = instagramEnabled
                      ? applyPublishingImageFormat(media, updated.crop?.aspectRatio ?? 'original')
                      : media
                    onChange(formatted.map(current =>
                      current.reference === updated.reference ? updated : current
                    ))
                  }
                }}
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
