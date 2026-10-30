'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { useIsMobile } from '@/hooks/use-mobile'
import type { PublishingMedia } from '@/lib/content-calendar'
import { ChevronDown, RotateCcw, X } from 'lucide-react'
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
  const isMobile = useIsMobile()
  const [draft, setDraft] = useState(item)
  const [altExpanded, setAltExpanded] = useState(false)
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const crop = draft.crop

  function save() {
    if (disabled) return
    onChange(draft)
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className={`${theme.surface} ${styles.dialog}`} overlayClassName={theme.overlay} aria-describedby={undefined} data-publish-surface="" data-publishing-image-editor="">
        <header className={styles.header}>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t('close')} className={styles.close}>
            <X className="size-4" />
          </Button>
          <DialogTitle className={styles.title}>{t('title')}</DialogTitle>
          <Button type="button" onClick={save} disabled={disabled} className={styles.mobileDone}>{t('done')}</Button>
        </header>
        <div className={styles.body}>
          <div className={styles.preview}>
            {previewUrl ? (
              <PublishingImagePreview item={draft} src={previewUrl} fullSize showUserTags={instagramEnabled} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('previewUnavailable')}</p>
            )}
          </div>
          <div className={styles.controls}>
            <fieldset disabled={disabled} className={styles.format}>
              <legend>{t('formatLabel')}</legend>
              <div className={styles.ratios}>
                {formats.map(format => (
                  <label key={format}>
                    <input
                      type="radio"
                      name={id + '-format'}
                      value={format}
                      checked={(crop?.aspectRatio ?? 'original') === format}
                      onChange={() => setDraft(applyPublishingImageFormat([draft], format)[0]!)}
                    />
                    <span>{format === 'original' ? t('original') : format}</span>
                  </label>
                ))}
              </div>
              {carousel && <p className={styles.formatHint}>{t('carouselHint')}</p>}
            </fieldset>
            <div className={styles.sliders}>
              {(['zoom', 'x', 'y'] as const).map(coordinate => {
                const isZoom = coordinate === 'zoom'
                const label = t(isZoom ? 'zoom' : coordinate === 'x' ? 'horizontal' : 'vertical')
                const value = crop ? (isZoom ? crop.zoom : crop[coordinate] * 100) : isZoom ? 1 : 50
                return (
                  <div key={coordinate}>
                    <div className={styles.sliderLabel}>
                      <span>{label}</span>
                      <span>{isZoom ? value.toFixed(2) + '×' : Math.round(value) + '%'}</span>
                    </div>
                    <Slider
                      aria-label={label}
                      min={isZoom ? 1 : 0}
                      max={isZoom ? 3 : 100}
                      step={isZoom ? 0.01 : 1}
                      value={[value]}
                      disabled={disabled || !crop}
                      onValueChange={values => {
                        if (!crop) return
                        setDraft({ ...draft, crop: { ...crop, [coordinate]: (values[0] ?? value) / (isZoom ? 1 : 100) } })
                      }}
                    />
                  </div>
                )
              })}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || !crop}
                onClick={() => crop && setDraft({ ...draft, crop: { ...crop, x: 0.5, y: 0.5, zoom: 1 } })}
              >
                <RotateCcw className="size-3.5" />{t('resetCrop')}
              </Button>
            </div>
            {(instagramEnabled || facebookEnabled) && (
              <section className={styles.metadata}>
                <button
                  type="button"
                  className={styles.disclosure}
                  aria-expanded={!isMobile || altExpanded}
                  aria-controls={id + '-alt-panel'}
                  onClick={() => setAltExpanded(value => !value)}
                >
                  {t('altText')}<ChevronDown className="size-4" />
                </button>
                <div id={id + '-alt-panel'} hidden={isMobile && !altExpanded}>
                  <Textarea
                    aria-label={t('altText')}
                    className="min-h-20 rounded-md text-sm"
                    value={draft.altText ?? ''}
                    disabled={disabled}
                    placeholder={t('altPlaceholder')}
                    onChange={event => setDraft({ ...draft, altText: Array.from(event.target.value).slice(0, 1000).join('') })}
                  />
                  <p className={styles.count}>{Array.from(draft.altText ?? '').length}/1000</p>
                </div>
              </section>
            )}
            {instagramEnabled && (
              <section className={styles.metadata}>
                <button
                  type="button"
                  className={styles.disclosure}
                  aria-expanded={!isMobile || tagsExpanded}
                  aria-controls={id + '-tags-panel'}
                  onClick={() => setTagsExpanded(value => !value)}
                >
                  <span>{t('tags')}{draft.userTags?.length ? ' · ' + draft.userTags.length : ''}</span><ChevronDown className="size-4" />
                </button>
                <div id={id + '-tags-panel'} hidden={isMobile && !tagsExpanded}>
                  <PublishingImageTags tags={draft.userTags ?? []} disabled={disabled} showLabel={false} onChange={userTags => setDraft({ ...draft, userTags })} />
                </div>
              </section>
            )}
          </div>
        </div>
        <footer className={styles.footer}>
          <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button type="button" disabled={disabled} onClick={save}>{t('done')}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
