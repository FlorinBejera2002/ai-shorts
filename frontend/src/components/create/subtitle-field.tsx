'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'

import { Switch } from '@/components/ui/switch'
import type { SubtitleStyle } from './settings-panel'

const STYLES: { value: Exclude<SubtitleStyle, 'none'>; labelKey: 'subtitleClean' | 'subtitleBold' | 'subtitleCaptionBox' }[] = [
  { value: 'clean', labelKey: 'subtitleClean' },
  { value: 'bold', labelKey: 'subtitleBold' },
  { value: 'caption-box', labelKey: 'subtitleCaptionBox' }
]

interface SubtitleFieldProps {
  style: SubtitleStyle
  onChange: (style: SubtitleStyle) => void
}

/** Subtitles switch with the style choice; the last chosen style is kept while the switch is off. */
export function SubtitleField({ style, onChange }: SubtitleFieldProps) {
  const t = useTranslations('create')
  const headingId = useId()
  const enabled = style !== 'none'
  const shownStyle = enabled ? style : 'clean'

  return (
    <section className="yt-inspector-section" aria-labelledby={headingId}>
      <h3 id={headingId}>{t('subtitles')}</h3>
      <div className="yt-switch-row">
        <label htmlFor={`${headingId}-switch`}>{t('addSubtitles')}</label>
        <Switch
          id={`${headingId}-switch`}
          checked={enabled}
          onCheckedChange={(on) => onChange(on ? 'clean' : 'none')}
        />
      </div>
      <div className="yt-segment yt-segment--fill" role="radiogroup" aria-label={t('subtitles')} aria-disabled={!enabled}>
        {STYLES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={enabled && shownStyle === option.value}
            disabled={!enabled}
            onClick={() => onChange(option.value)}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </section>
  )
}
