import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/auth'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { publishingFileType, publishingUploadErrorKey, uploadPublishingFile } from './publishing-media-utils'

export function InstagramCoverPicker({ reference, disabled, id, onChange, onUploadingChange }: {
  reference: string
  disabled: boolean
  id: string
  onChange: (reference: string) => void
  onUploadingChange: (uploading: boolean) => void
}) {
  const t = useTranslations('publishing')
  const calendarT = useTranslations('contentCalendar')
  const [preview, setPreview] = useState<{ reference: string; url: string } | null>(null)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
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

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('instagramCover')}</Label>
      <Input id={id} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={disabled}
        aria-describedby={`${id}-hint`} onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void upload(file)
        }} />
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
