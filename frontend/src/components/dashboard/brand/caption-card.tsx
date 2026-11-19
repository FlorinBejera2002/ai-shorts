'use client'

import { useTranslations } from 'next-intl'
import { CaptionForm } from './caption-form'
import { CaptionPresetStrip } from './caption-preset-strip'
import { PRESET_ORDER } from './editor-utils'
import { legacyCaptionStyle } from './caption-style'
import type { BrandKit, BrandKitUpdate } from './types'
import editor from './brand-editor.module.css'
import styles from './caption-card.module.css'

/** "Subtitrări": style count, the preset strip and the caption form. */
export function CaptionCard({
  kit,
  update,
  onBusyChange
}: {
  kit: BrandKit
  update: BrandKitUpdate
  onBusyChange: (busy: boolean) => void
}) {
  const t = useTranslations('brand')
  const style = legacyCaptionStyle(kit)
  const change = (next: typeof style) => update('captionStyle', next)
  return (
    <section className={`${editor.card} ${styles.card}`} aria-labelledby="brand-captions-title" data-brand-captions="">
      <div className={styles.head}>
        <h2 id="brand-captions-title" className={editor.heading}>
          {t('subtitleStyle')}
        </h2>
        <span className={editor.muted}>{t('editor.stylesCount', { count: PRESET_ORDER.length })}</span>
      </div>
      <CaptionPresetStrip value={style} onChange={change} />
      <CaptionForm value={style} onChange={change} onBusyChange={onBusyChange} />
    </section>
  )
}
