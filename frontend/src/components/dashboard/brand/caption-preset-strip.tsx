import { useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'
import type { CaptionStyle } from './caption-style'
import { PRESET_ORDER, type CaptionPreset } from './editor-utils'
import styles from './caption-card.module.css'

/** "Povestea ta astăzi" rendered the way each style shows it. */
function PresetSample({ preset }: { preset: CaptionPreset }) {
  const t = useTranslations('brand.editorDesign')
  const start = t('sampleStart')
  const word = t('sampleActive')
  const samples: Record<CaptionPreset, ReactNode> = {
    'active-color': <span className={styles.outline}>{start} <span className={styles.active}>{word}</span></span>,
    classic: <span className={styles.outline}>{start} {word}</span>,
    minimal: <span className={styles.light}>{start} {word}</span>,
    'bold-outline': <span className={styles.heavy}>{start} {word}</span>,
    'contrast-box': <span className={styles.box}>{start} {word}</span>,
    headline: <span className={`${styles.outline} ${styles.headline}`}>{start}</span>,
    'word-by-word': <span className={`${styles.outline} ${styles.word}`}>{word}</span>,
    karaoke: <span className={styles.outline}><span className={styles.active}>{start}</span> {word}</span>,
    'active-background': <span className={styles.outline}>{start} <span className={styles.highlight}>{word}</span></span>,
    'phrase-pop': <span className={styles.outline}>{start} <span className={styles.faded}>{word}</span></span>,
    'subtle-fade': <span className={styles.soft}>{start} {word}</span>,
    stacked: <span className={styles.outline}>{start}<br />{word}</span>
  }
  return samples[preset]
}

export function CaptionPresetStrip({ value, onChange }: { value: CaptionStyle; onChange: (value: CaptionStyle) => void }) {
  const t = useTranslations('brand')
  const colors = { '--sample-text': value.text_color, '--sample-active': value.highlight_color } as CSSProperties
  return (
    <div role="group" aria-label={t('editor.presetGroup')} className={styles.strip} style={colors} data-brand-presets="">
      {PRESET_ORDER.map((preset) => (
        <button
          key={preset}
          type="button"
          className={styles.preset}
          aria-label={t(`preset_${preset}`)}
          aria-pressed={value.preset === preset}
          onClick={() => onChange({ ...value, preset })}
        >
          <span className={styles.sample} aria-hidden="true">
            <PresetSample preset={preset} />
          </span>
          <span className={styles.presetName}>{t(`preset_${preset}`)}</span>
        </button>
      ))}
    </div>
  )
}
