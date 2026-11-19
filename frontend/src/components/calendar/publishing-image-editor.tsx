'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import type { PublishingImageCrop, PublishingMedia } from '@/lib/content-calendar'
import { Move, RotateCcw, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { PublishingImagePreview } from './publishing-image-preview'
import { PublishingImageTags } from './publishing-image-tags'
import { applyPublishingImageFormat, type PublishingImageFormat } from './publishing-image-utils'
import styles from './publishing-image-editor.module.css'
import theme from './publishing-theme.module.css'

const formats: PublishingImageFormat[] = ['original', '1:1', '4:5', '1.91:1']

interface PublishingImageEditorProps {
  item: PublishingMedia
  previewUrl?: string
  disabled: boolean
  instagramEnabled: boolean
  facebookEnabled: boolean
  tiktokEnabled?: boolean
  carousel?: boolean
  onChange: (item: PublishingMedia) => void
  onClose: () => void
}

function PhotoCropStage({ draft, previewUrl, disabled, instagramEnabled, onCropChange }: {
  draft: PublishingMedia
  previewUrl?: string
  disabled: boolean
  instagramEnabled: boolean
  onCropChange: (crop: PublishingImageCrop) => void
}) {
  const t = useTranslations('contentCalendar.imageEditor')
  const positionable = Boolean(draft.crop) && !disabled
  return (
    <div className={styles.stageColumn}>
      <div className={styles.stage}>
        {previewUrl && <img src={previewUrl} alt='' aria-hidden='true' className={styles.backdrop} />}
        {previewUrl ? (
          <PublishingImagePreview
            item={draft}
            src={previewUrl}
            fullSize
            showUserTags={instagramEnabled}
            positionLabel={t('dragToPosition')}
            onCropChange={positionable ? onCropChange : undefined}
          />
        ) : (
          <p className={styles.unavailable}>{t('previewUnavailable')}</p>
        )}
        {positionable && (
          <span className={styles.positionHint}>
            <Move className='size-3.5' aria-hidden='true' />
            {t('dragToPosition')}
          </span>
        )}
      </div>
    </div>
  )
}

function PhotoFormatField({ id, crop, disabled, carousel, onFormat }: {
  id: string
  crop?: PublishingImageCrop
  disabled: boolean
  carousel: boolean
  onFormat: (format: PublishingImageFormat) => void
}) {
  const t = useTranslations('contentCalendar.imageEditor')
  return (
    <fieldset disabled={disabled} className={styles.field}>
      <legend className={styles.fieldLabel}>{t('formatLabel')}</legend>
      <div className={styles.ratios}>
        {formats.map(format => (
          <label key={format} className={styles.ratio}>
            <input
              type='radio'
              name={id + '-format'}
              value={format}
              checked={(crop?.aspectRatio ?? 'original') === format}
              onChange={() => onFormat(format)}
            />
            <span className={styles.ratioShape} aria-hidden='true' data-format={format} />
            <span>{format === 'original' ? t('original') : format}</span>
          </label>
        ))}
      </div>
      {carousel && <p className={styles.formatHint}>{t('carouselHint')}</p>}
    </fieldset>
  )
}

function PhotoZoomField({ zoom, hasCrop, disabled, onZoom, onReset }: {
  zoom: number
  hasCrop: boolean
  disabled: boolean
  onZoom: (zoom: number) => void
  onReset: () => void
}) {
  const t = useTranslations('contentCalendar.imageEditor')
  return (
    <div className={styles.field}>
      <div className={styles.zoomHeader}>
        <span className={styles.fieldLabel}>{t('zoom')}</span>
        <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
      </div>
      <div className={styles.zoomRow}>
        <Slider
          aria-label={t('zoom')}
          min={1}
          max={3}
          step={0.01}
          value={[zoom]}
          disabled={disabled || !hasCrop}
          onValueChange={values => onZoom(values[0] ?? zoom)}
        />
      </div>
      <Button type='button' variant='ghost' size='sm' className={styles.reset} disabled={disabled || !hasCrop} onClick={onReset}>
        <RotateCcw className='size-3.5' aria-hidden='true' />
        {t('resetCrop')}
      </Button>
    </div>
  )
}

function PhotoAltTextField({ id, value, disabled, onChange }: {
  id: string
  value: string
  disabled: boolean
  onChange: (altText: string) => void
}) {
  const t = useTranslations('contentCalendar.imageEditor')
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>{t('altText')}</label>
      <Textarea
        id={id}
        aria-label={t('altText')}
        className={styles.altText}
        value={value}
        disabled={disabled}
        placeholder={t('altPlaceholder')}
        onChange={event => onChange(Array.from(event.target.value).slice(0, 1000).join(''))}
      />
      <p className={styles.helper}>{t('altHint')}</p>
    </div>
  )
}

export function PublishingImageEditor({
  item,
  previewUrl,
  disabled,
  instagramEnabled,
  facebookEnabled,
  carousel = false,
  onChange,
  onClose
}: PublishingImageEditorProps) {
  const t = useTranslations('contentCalendar.imageEditor')
  const id = useId()
  // Draft edits stay local until Done, so Cancel discards format, crop, alt text and tags together.
  const [draft, setDraft] = useState(item)
  const crop = draft.crop
  const zoom = crop?.zoom ?? 1

  function save() {
    if (disabled) return
    onChange(draft)
    onClose()
  }

  function updateCrop(patch: Partial<PublishingImageCrop>) {
    setDraft(current => (current.crop ? { ...current, crop: { ...current.crop, ...patch } } : current))
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        className={`${theme.surface} ${styles.dialog}`}
        overlayClassName={theme.overlay}
        aria-describedby={undefined}
        data-publish-surface=''
        data-publishing-image-editor=''
      >
        <header className={styles.header}>
          <DialogTitle className={styles.title}>{t('title')}</DialogTitle>
          <Button type='button' variant='ghost' size='icon' onClick={onClose} aria-label={t('close')} className={styles.close}>
            <X className='size-5' />
          </Button>
        </header>
        <div className={styles.body}>
          <PhotoCropStage
            draft={draft}
            previewUrl={previewUrl}
            disabled={disabled}
            instagramEnabled={instagramEnabled}
            onCropChange={updateCrop}
          />
          <div className={styles.controls}>
            <PhotoFormatField
              id={id}
              crop={crop}
              disabled={disabled}
              carousel={carousel}
              onFormat={format => setDraft(applyPublishingImageFormat([draft], format)[0]!)}
            />
            <PhotoZoomField
              zoom={zoom}
              hasCrop={Boolean(crop)}
              disabled={disabled}
              onZoom={nextZoom => updateCrop({ zoom: nextZoom })}
              onReset={() => updateCrop({ x: 0.5, y: 0.5, zoom: 1 })}
            />
            {(instagramEnabled || facebookEnabled) && (
              <PhotoAltTextField
                id={id + '-alt'}
                value={draft.altText ?? ''}
                disabled={disabled}
                onChange={altText => setDraft(current => ({ ...current, altText }))}
              />
            )}
            {instagramEnabled && (
              <div className={styles.field}>
                <PublishingImageTags
                  tags={draft.userTags ?? []}
                  disabled={disabled}
                  showLabel
                  onChange={userTags => setDraft(current => ({ ...current, userTags }))}
                />
              </div>
            )}
          </div>
        </div>
        <footer className={styles.footer}>
          <Button type='button' variant='ghost' className={styles.secondaryAction} onClick={onClose}>{t('cancel')}</Button>
          <Button type='button' disabled={disabled} className={styles.primaryAction} onClick={save}>{t('done')}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
