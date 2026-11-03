'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { PublishingMedia } from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import theme from './publishing-theme.module.css'
import {
  applyPublishingImageFormat,
  publishingImageFormatsMatch,
  type PublishingImageFormat
} from './publishing-image-utils'

export function PublishingImageFormatSelector({
  media,
  disabled,
  instagramEnabled,
  facebookEnabled,
  tiktokEnabled = false,
  onChange
}: {
  media: PublishingMedia[]
  disabled: boolean
  instagramEnabled: boolean
  facebookEnabled: boolean
  tiktokEnabled?: boolean
  onChange: (media: PublishingMedia[]) => void
}) {
  const t = useTranslations('contentCalendar.imageEditor')
  const id = useId()
  const firstImage = media.find(item => item.type === 'image')
  if (!firstImage) return null

  const format = firstImage.crop?.aspectRatio ?? 'original'
  const formatsMatch = publishingImageFormatsMatch(media)
  let hint:
    | 'carouselHint'
    | 'mixedCarouselHint'
    | 'originalHint'
    | 'photoFormatHint'
    | 'photoOriginalHint' = 'carouselHint'
  if (!instagramEnabled) {
    hint = formatsMatch && format === 'original'
      ? 'photoOriginalHint'
      : 'photoFormatHint'
  } else if (formatsMatch) {
    if (media.some(item => item.type === 'video')) hint = 'mixedCarouselHint'
    else if (format === 'original') hint = 'originalHint'
  }
  const label = t(facebookEnabled || tiktokEnabled ? 'formatGeneric' : 'format')
  const multipleDestinations = [instagramEnabled, facebookEnabled, tiktokEnabled]
    .filter(Boolean).length > 1

  return (
    <div className="mt-3 space-y-2 rounded-md border bg-card p-3">
      <label htmlFor={id} className="text-xs font-semibold">
        {label}
      </label>
      <Select
        value={formatsMatch ? format : ''}
        disabled={disabled}
        onValueChange={value =>
          onChange(applyPublishingImageFormat(media, value as PublishingImageFormat))
        }
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={instagramEnabled && !formatsMatch}
          aria-describedby={`${id}-hint`}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent className={theme.surface} data-publish-surface="">
          <SelectItem value="original">{t('original')}</SelectItem>
          <SelectItem value="1:1">{t('square')}</SelectItem>
          <SelectItem value="4:5">{t('portrait')}</SelectItem>
          <SelectItem value="1.91:1">{t('landscape')}</SelectItem>
        </SelectContent>
      </Select>
      <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">
        {t(hint)}
      </p>
      {(multipleDestinations || tiktokEnabled) && (
        <p className="text-[11px] text-muted-foreground">
          {t('photoDestinationsHint')}
        </p>
      )}
    </div>
  )
}
