'use client'

import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/auth'
import type { PublishingMedia } from '@/lib/content-calendar'
import { Reorder } from 'framer-motion'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
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
import { PublishingUploadProgress } from './publishing-upload-progress'
import dialogStyles from './post-media-dialog.module.css'

type UploadProgress = { current: number; total: number; filename: string }

type PickerProps = {
  presentation?: 'inline' | 'dialog'
  media: PublishingMedia[]
  disabled: boolean
  instagramEnabled?: boolean
  facebookEnabled?: boolean
  tiktokEnabled?: boolean
  /** A validation message for the current media selection. Upload failures are shown as toasts. */
  error?: string
  onChange: (media: PublishingMedia[]) => void
  onUploadingChange: (uploading: boolean) => void
}

const mediaPreviewKey = (reference: string) => ['publishing-media-preview', reference] as const

/** Server preview URLs live in React Query; fresh uploads register their blob URL in the same cache. */
function useMediaPreviews(media: PublishingMedia[]) {
  const queryClient = useQueryClient()
  const results = useQueries({
    queries: media.map(item => ({
      queryKey: mediaPreviewKey(item.reference),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await apiFetch(
          `/api/publishing/media/preview?reference=${encodeURIComponent(item.reference)}`,
          { signal }
        )
        if (!response.ok) throw new Error('preview unavailable')
        return (await response.json() as { url: string }).url
      },
      staleTime: Infinity,
      retry: false
    }))
  })
  const previews: Record<string, string> = {}
  results.forEach((result, index) => {
    if (result.data) previews[media[index]!.reference] = result.data
  })

  const rememberPreview = (reference: string, url: string) => {
    queryClient.setQueryData(mediaPreviewKey(reference), url)
  }
  const forgetPreview = (reference: string) => {
    const url = queryClient.getQueryData<string>(mediaPreviewKey(reference))
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    queryClient.removeQueries({ queryKey: mediaPreviewKey(reference) })
  }
  /** Revokes this picker's blob previews when it closes; later openings fetch fresh server URLs. */
  const releaseBlobPreviews = useCallback(() => {
    for (const [, url] of queryClient.getQueriesData<string>({ queryKey: ['publishing-media-preview'] })) {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    queryClient.removeQueries({ queryKey: ['publishing-media-preview'] })
  }, [queryClient])
  return { previews, rememberPreview, forgetPreview, releaseBlobPreviews }
}

/** Files dragged over the device tab; the overlay shows while files hover the panel. */
function useFileDrop(disabled: boolean, onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false)
  const handlers = {
    onDragOver: (event: DragEvent<HTMLDivElement>) => { if (!disabled) event.preventDefault() },
    onDragEnter: (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragging(false)
      if (!disabled) onFiles(Array.from(event.dataTransfer.files))
    }
  }
  return { dragging, handlers }
}

/** Reorder list: a horizontal tile grid in the dialog, a vertical list inline. */
function MediaReorderList({ media, disabled, presentation, previews, instagramEnabled, facebookEnabled, tiktokEnabled, label, onChange, onRemove }: {
  media: PublishingMedia[]
  disabled: boolean
  presentation: 'inline' | 'dialog'
  previews: Record<string, string>
  instagramEnabled: boolean
  facebookEnabled: boolean
  tiktokEnabled: boolean
  label: string
  onChange: (media: PublishingMedia[]) => void
  onRemove: (reference: string) => void
}) {
  const isDialog = presentation === 'dialog'
  return (
    <Reorder.Group
      axis={isDialog ? 'x' : 'y'}
      values={media}
      onReorder={(items) => {
        if (!disabled) onChange(items)
      }}
      className={isDialog ? 'contents' : 'space-y-2'}
      aria-label={label}
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
          variant={isDialog ? 'tile' : 'row'}
          onChange={updated => {
            if (disabled) return
            // Instagram uses one format for its whole carousel. Commit
            // that format only when the focused editor is confirmed.
            const formatted = instagramEnabled
              ? applyPublishingImageFormat(media, updated.crop?.aspectRatio ?? 'original')
              : media
            onChange(formatted.map(current =>
              current.reference === updated.reference ? updated : current
            ))
          }}
          onRemove={onRemove}
          onMove={(reference, target) => {
            if (!disabled) onChange(movePublishingMedia(media, reference, target))
          }}
        />
      ))}
    </Reorder.Group>
  )
}

/** Dialog device tab: tile grid with the "Add" tile, reorder hint, progress, and a whole-panel drop target. */
function DeviceDropPanel({ media, disabled, error, inputId, progress, reorderList, onUpload, onFiles }: {
  media: PublishingMedia[]
  disabled: boolean
  error?: string
  inputId: string
  progress: UploadProgress | null
  reorderList: ReactNode
  onUpload: (files: File[]) => Promise<void>
  onFiles: (files: File[]) => void
}) {
  const t = useTranslations('contentCalendar')
  const drop = useFileDrop(disabled, onFiles)
  return (
    <div className={dialogStyles.devicePanel} data-media-drop-zone="" data-dragging={drop.dragging || undefined} {...drop.handlers}>
      {drop.dragging && (
        <div className={dialogStyles.dropOverlay} aria-hidden="true">
          <span className={dialogStyles.dropIcon}><Download className="size-6" /></span>
          <span className={dialogStyles.dropTitle}>{t('composer.dropTitle')}</span>
          <span className={dialogStyles.dropHint}>{t('composer.dropHint')}</span>
        </div>
      )}
      <div className={dialogStyles.deviceGrid}>
        {reorderList}
        <PublishingMediaUploadZone
          presentation="dialog"
          inputId={inputId}
          mediaCount={media.length}
          disabled={disabled}
          error={error}
          progress={progress}
          onUpload={onUpload}
        />
      </div>
      {media.length > 0 && <p className={dialogStyles.deviceHint}>{t('composer.reorderHint')}</p>}
      {progress && (
        <div className={dialogStyles.uploadProgress}>
          <PublishingUploadProgress {...progress} />
        </div>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-2 whitespace-pre-line text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** Inline picker used outside the media dialog: format selector, upload zone and a vertical reorder list. */
function InlinePicker({ media, disabled, error, inputId, progress, photoEditorEnabled, instagramEnabled, facebookEnabled, tiktokEnabled, reorderList, onChange, onUpload }: {
  media: PublishingMedia[]
  disabled: boolean
  error?: string
  inputId: string
  progress: UploadProgress | null
  photoEditorEnabled: boolean
  instagramEnabled: boolean
  facebookEnabled: boolean
  tiktokEnabled: boolean
  reorderList: ReactNode
  onChange: (media: PublishingMedia[]) => void
  onUpload: (files: File[]) => Promise<void>
}) {
  const t = useTranslations('contentCalendar')
  return (
    <div className="pt-1">
      <label htmlFor={inputId} className="text-xs font-semibold text-foreground">
        {t('form.mediaLabel')}
      </label>
      {photoEditorEnabled && (
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
        presentation="inline"
        inputId={inputId}
        mediaCount={media.length}
        disabled={disabled}
        error={error}
        progress={progress}
        onUpload={onUpload}
      />
      {media.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] text-muted-foreground">
            {t('form.mediaOrderHint')}
          </p>
          {reorderList}
        </div>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-2 whitespace-pre-line text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function PublishingMediaPicker({
  presentation = 'inline',
  media,
  disabled,
  instagramEnabled = false,
  facebookEnabled = false,
  tiktokEnabled = false,
  error,
  onChange,
  onUploadingChange
}: PickerProps) {
  const t = useTranslations('contentCalendar')
  const addToast = useToast((state) => state.add)
  const inputId = useId()
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const { previews, rememberPreview, forgetPreview, releaseBlobPreviews } = useMediaPreviews(media)
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
      releaseBlobPreviews()
    },
    [releaseBlobPreviews]
  )

  async function upload(files: File[]) {
    if (!files.length || disabled || controller.current) return
    if (media.length + files.length > MAX_PUBLISHING_MEDIA) {
      addToast('error', t('validation.mediaInvalid'))
      return
    }
    const unsupported = files.find((file) => !publishingFileType(file))
    if (unsupported) {
      addToast('error', `${unsupported.name}: ${t('validation.mediaUnsupported')}`)
      return
    }
    const request = new AbortController()
    controller.current = request
    onUploadingChange(true)
    const uploaded = [...media]
    try {
      // Sequential on purpose: parallel uploads would exhaust mobile memory and connections,
      // and progress reports one file at a time. Successful files are kept if one fails.
      const uploadOne = async (file: File, index: number) => {
        if (request.signal.aborted) return
        setProgress({ current: index + 1, total: files.length, filename: file.name })
        try {
          const item = await uploadPublishingFile(file, apiFetch, request.signal)
          if (request.signal.aborted) return
          rememberPreview(item.reference, URL.createObjectURL(file))
          uploaded.push(
            photoEditorEnabled
              ? applyPublishingImageFormat([item], imageFormat)[0]!
              : item
          )
          onChange([...uploaded])
        } catch (cause) {
          if (request.signal.aborted) return
          const key = publishingUploadErrorKey(cause)
          addToast('error', `${file.name}: ${t(`validation.${key}`)}`)
        }
      }
      await files.reduce<Promise<void>>(
        (previous, file, index) => previous.then(() => uploadOne(file, index)),
        Promise.resolve()
      )
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
    forgetPreview(reference)
    onChange(media.filter((item) => item.reference !== reference))
  }

  const reorderList = media.length > 0 && (
    <MediaReorderList
      media={media}
      disabled={disabled}
      presentation={presentation}
      previews={previews}
      instagramEnabled={instagramEnabled}
      facebookEnabled={facebookEnabled}
      tiktokEnabled={tiktokEnabled}
      label={t('form.mediaOrder')}
      onChange={onChange}
      onRemove={remove}
    />
  )

  if (presentation === 'dialog') {
    return (
      <DeviceDropPanel
        media={media}
        disabled={disabled}
        error={error}
        inputId={inputId}
        progress={progress}
        reorderList={reorderList}
        onUpload={upload}
        onFiles={files => { void upload(files) }}
      />
    )
  }
  return (
    <InlinePicker
      media={media}
      disabled={disabled}
      error={error}
      inputId={inputId}
      progress={progress}
      photoEditorEnabled={photoEditorEnabled}
      instagramEnabled={instagramEnabled}
      facebookEnabled={facebookEnabled}
      tiktokEnabled={tiktokEnabled}
      reorderList={reorderList}
      onChange={onChange}
      onUpload={upload}
    />
  )
}
