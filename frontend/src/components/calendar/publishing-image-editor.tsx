'use client'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import type { PublishingMedia } from '@/lib/content-calendar'
import { RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { PublishingImagePreview } from './publishing-image-preview'
import { PublishingImageTags } from './publishing-image-tags'

export function PublishingImageEditor({
  item,
  previewUrl,
  disabled,
  instagramEnabled,
  facebookEnabled,
  tiktokEnabled = false,
  onChange
}: {
  item: PublishingMedia
  previewUrl?: string
  disabled: boolean
  instagramEnabled: boolean
  facebookEnabled: boolean
  tiktokEnabled?: boolean
  onChange: (item: PublishingMedia) => void
}) {
  const t = useTranslations('contentCalendar.imageEditor')
  const id = useId()
  const crop = item.crop

  return (
    <div className="mt-2 space-y-4 border-t px-2 pb-2 pt-4">
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div>
          {previewUrl ? (
            <PublishingImagePreview
              item={item}
              src={previewUrl}
              showUserTags={instagramEnabled}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{t('previewUnavailable')}</p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t(facebookEnabled || tiktokEnabled ? 'previewHintGeneric' : 'previewHint')}
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold">{t('crop')}</p>
          {crop ? <>
            {(['x', 'y', 'zoom'] as const).map(coordinate => {
              const label = t(coordinate === 'x' ? 'horizontal' : coordinate === 'y' ? 'vertical' : 'zoom')
              const isZoom = coordinate === 'zoom'
              return (
                <div key={coordinate}>
                  <div className="flex items-center justify-between text-xs">
                    <span>{label}</span>
                    <span className="tabular-nums text-muted-foreground">{isZoom ? `${crop.zoom.toFixed(2)}×` : `${Math.round(crop[coordinate] * 100)}%`}</span>
                  </div>
                  <Slider
                    aria-label={label}
                    min={isZoom ? 1 : 0}
                    max={isZoom ? 3 : 100}
                    step={isZoom ? 0.01 : 1}
                    value={[isZoom ? crop.zoom : crop[coordinate] * 100]}
                    disabled={disabled}
                    onValueChange={values => onChange({ ...item, crop: { ...crop, [coordinate]: (values[0] ?? (isZoom ? 1 : 50)) / (isZoom ? 1 : 100) } })}
                  />
                </div>
              )
            })}
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange({ ...item, crop: { ...crop, x: 0.5, y: 0.5, zoom: 1 } })}>
              <RotateCcw className="size-3.5" />{t('resetCrop')}
            </Button>
          </> : <p className="text-xs text-muted-foreground">{t('chooseFormatHint')}</p>}
        </div>
      </div>
      {(instagramEnabled || facebookEnabled) && (
        <div className="space-y-2">
          <label htmlFor={`${id}-alt`} className="text-xs font-semibold">
            {t('altText')}
          </label>
          <Textarea
            id={`${id}-alt`}
            className="min-h-20 rounded-md text-xs"
            value={item.altText ?? ''}
            disabled={disabled}
            placeholder={t('altPlaceholder')}
            aria-describedby={`${id}-alt-hint ${id}-alt-count`}
            onChange={event => onChange({
              ...item,
              altText: Array.from(event.target.value).slice(0, 1000).join('')
            })}
          />
          <div className="flex items-start justify-between gap-3 text-[11px] text-muted-foreground">
            <p id={`${id}-alt-hint`}>{t('altHint')}</p>
            <span id={`${id}-alt-count`} className="shrink-0 tabular-nums">
              {Array.from(item.altText ?? '').length}/1000
            </span>
          </div>
        </div>
      )}
      {instagramEnabled && (
        <PublishingImageTags
          tags={item.userTags ?? []}
          disabled={disabled}
          onChange={userTags => onChange({ ...item, userTags })}
        />
      )}
    </div>
  )
}
