'use client'

import { ImagePlus, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { MAX_PUBLISHING_MEDIA, PUBLISHING_FILE_ACCEPT } from './publishing-media-utils'
import { PublishingUploadProgress } from './publishing-upload-progress'
import dialogStyles from './post-media-dialog.module.css'

type UploadProgress = {
  current: number
  total: number
  filename: string
}

type UploadZoneProps = {
  presentation: 'inline' | 'dialog'
  inputId: string
  mediaCount: number
  disabled: boolean
  error?: string
  progress: UploadProgress | null
  onUpload: (files: File[]) => Promise<void>
}

function PublishingFileInput({ inputId, disabled, progress, error, ariaLabel, onUpload }: {
  inputId: string
  disabled: boolean
  progress: UploadProgress | null
  error?: string
  ariaLabel?: string
  onUpload: (files: File[]) => Promise<void>
}) {
  return (
    <input
      id={inputId}
      type="file"
      accept={PUBLISHING_FILE_ACCEPT}
      multiple={true}
      disabled={disabled}
      aria-busy={!!progress}
      aria-label={ariaLabel}
      className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      aria-describedby={progress ? undefined : `${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
      aria-invalid={Boolean(error)}
      onChange={event => {
        const files = Array.from(event.currentTarget.files ?? [])
        event.currentTarget.value = ''
        void onUpload(files)
      }}
    />
  )
}

/** The dialog's "Add" tile sits in the device grid; dropping files is handled by the picker. */
function DialogUploadTile({ input, inputId, disabled }: {
  input: ReactNode
  inputId: string
  disabled: boolean
}) {
  const t = useTranslations('contentCalendar.composer')
  return (
    <label className={dialogStyles.addTile} data-disabled={disabled} aria-describedby={`${inputId}-hint`}>
      {input}
      <Plus aria-hidden="true" />
      <span id={`${inputId}-hint`}>{t('addMedia')}</span>
    </label>
  )
}

function InlineUploadZone({ input, inputId, disabled, progress, mediaCount }: {
  input: ReactNode
  inputId: string
  disabled: boolean
  progress: UploadProgress | null
  mediaCount: number
}) {
  const t = useTranslations('contentCalendar.form')
  return (
    <label className={`relative mt-2 flex items-center gap-3 rounded-md border border-border bg-card px-4 ${progress ? 'min-h-48 cursor-wait py-5' : `min-h-20 py-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}`}>
      {input}
      {progress ? <PublishingUploadProgress {...progress} /> : (
        <>
          <ImagePlus className="size-5 shrink-0" />
          <span className="min-w-0">
            <span id={`${inputId}-hint`} className="block text-xs font-semibold">
              {t(mediaCount ? 'mediaAdd' : 'mediaChoose')}
            </span>
          </span>
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
            {mediaCount}/{MAX_PUBLISHING_MEDIA}
          </span>
        </>
      )}
    </label>
  )
}

export function PublishingMediaUploadZone({ presentation, inputId, mediaCount, disabled, error, progress, onUpload }: UploadZoneProps) {
  const t = useTranslations('contentCalendar.composer')
  const inputDisabled = disabled || !!progress || mediaCount >= MAX_PUBLISHING_MEDIA
  const input = (
    <PublishingFileInput
      inputId={inputId}
      disabled={inputDisabled}
      progress={progress}
      error={error}
      ariaLabel={presentation === 'dialog' ? t('chooseFiles') : undefined}
      onUpload={onUpload}
    />
  )

  return presentation === 'dialog'
    ? <DialogUploadTile input={input} inputId={inputId} disabled={inputDisabled} />
    : <InlineUploadZone input={input} inputId={inputId} disabled={disabled} progress={progress} mediaCount={mediaCount} />
}
