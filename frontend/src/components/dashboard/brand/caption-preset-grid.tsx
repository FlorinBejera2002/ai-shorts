import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CAPTION_PRESETS, type CaptionStyle } from './caption-style'
import styles from './caption-editor.module.css'

export function CaptionPresetGrid({ value, onChange, compact = false }: {
  value: CaptionStyle
  onChange: (value: CaptionStyle) => void
  compact?: boolean
}) {
  const t = useTranslations('brand')
  const presets = compact ? CAPTION_PRESETS.slice(0, 3) : CAPTION_PRESETS
  return (
    <div className={styles.presetGrid} data-compact={compact}>
      {presets.map(preset => (
        <button
          key={preset}
          type="button"
          aria-label={t(`preset_${preset}`)}
          aria-pressed={value.preset === preset}
          className={styles.preset}
          onClick={() => onChange({ ...value, preset })}
        >
          <span className={styles.presetCanvas} data-preset={preset} data-selected={value.preset === preset}>
            <span className={styles.presetSample} aria-hidden="true">
              <span>{t(compact ? 'editorDesign.sampleOverviewStart' : 'editorDesign.sampleStart')}</span>{' '}
              <strong>{t('editorDesign.sampleActive')}</strong>
            </span>
            {!compact && value.preset === preset && <span className={styles.presetCheck}><Check className="size-3" /></span>}
          </span>
          <span className={styles.presetName}>{t(`preset_${preset}`)}</span>
        </button>
      ))}
    </div>
  )
}
