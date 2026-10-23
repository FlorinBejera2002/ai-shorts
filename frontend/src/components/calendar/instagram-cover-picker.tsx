import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/auth'
import { ImageIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { publishingFileType, publishingUploadErrorKey, uploadPublishingFile } from './publishing-media-utils'
import styles from './post-platform-options.module.css'

export function InstagramCoverPicker({ reference, disabled, id, onChange, onUploadingChange, presentation = 'section', previewUrl }: {
  reference: string
  disabled: boolean
  id: string
  onChange: (reference: string) => void
  onUploadingChange: (uploading: boolean) => void
  presentation?: 'section' | 'drawer'
  previewUrl?: string
}) {
  const t = useTranslations('publishing')
  const calendarT = useTranslations('contentCalendar')
  const composerT = useTranslations('contentCalendar.composer')
  const [preview, setPreview] = useState<{ reference: string; url: string } | null>(null)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!reference) return
    const controller = new AbortController()
    void apiFetch(`/api/publishing/media/preview?reference=${encodeURIComponent(reference)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) return
        const result = await response.json() as { url: string }
        if (!controller.signal.aborted) setPreview({ reference, url: result.url })
      }).catch(() => {})
    return () => controller.abort()
  }, [reference])

  async function upload(file: File) {
    if (disabled || request.current) return
    if (publishingFileType(file) !== 'image') {
      setError(calendarT('validation.mediaUnsupported'))
      return
    }
    const controller = new AbortController()
    request.current = controller
    setError('')
    onUploadingChange(true)
    try {
      const uploaded = await uploadPublishingFile(file, apiFetch, controller.signal)
      if (!controller.signal.aborted) onChange(uploaded.reference)
    } catch (cause) {
      if (!controller.signal.aborted) setError(calendarT(`validation.${publishingUploadErrorKey(cause)}`))
    } finally {
      request.current = null
      onUploadingChange(false)
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void upload(file)
  }

  if (presentation === 'drawer') {
    const imageUrl = reference
      ? (preview?.reference === reference ? preview.url : undefined)
      : previewUrl

    return (
      <div className={styles.coverField}>
        <Label htmlFor={id} className={styles.fieldLabel}>{composerT('cover')}</Label>
        <input
          ref={fileInput}
          id={id}
          type="file"
          className="sr-only"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={onFileChange}
        />
        <div className={styles.coverContent}>
          <div className={styles.coverPreview}>
            {imageUrl
              ? <img src={imageUrl} alt={t('instagramCover')} />
              : <ImageIcon className="size-7" aria-hidden="true" />}
          </div>
          <Button type="button" variant="outline" disabled={disabled} onClick={() => fileInput.current?.click()}>
            {composerT('change')}
          </Button>
        </div>
        <p id={`${id}-hint`} className={styles.coverHint}>{t('instagramCoverHint')}</p>
        {reference && (
          <Button className={styles.removeCover} type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange('')}>
            {t('instagramRemoveCover')}
          </Button>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('instagramCover')}</Label>
      <Input id={id} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={disabled}
        aria-describedby={`${id}-hint`} onChange={onFileChange} />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t('instagramCoverHint')}</p>
      {reference && (
        <div className="flex items-center gap-3 rounded-md border p-2">
          {preview?.reference === reference && <img src={preview.url} alt={t('instagramCover')} className="aspect-[9/16] w-16 rounded-sm object-cover" />}
          <span className="flex-1 text-xs">{t('instagramCustomCover')}</span>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange('')}>{t('instagramRemoveCover')}</Button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
