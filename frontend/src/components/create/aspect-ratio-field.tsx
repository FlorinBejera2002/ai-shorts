'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'

import type { AspectRatio } from './settings-panel'

const RATIOS: { value: AspectRatio; width: number; height: number }[] = [
  { value: '9:16', width: 13, height: 21 },
  { value: '1:1', width: 17, height: 17 },
  { value: '16:9', width: 26, height: 16 }
]

interface AspectRatioFieldProps {
  value: AspectRatio
  onChange: (value: AspectRatio) => void
}

/** Three aspect-ratio tiles; each glyph is drawn at its own proportions. */
export function AspectRatioField({ value, onChange }: AspectRatioFieldProps) {
  const t = useTranslations('create')
  const headingId = useId()

  return (
    <section className="yt-inspector-section" aria-labelledby={headingId}>
      <h3 id={headingId}>{t('aspectRatio')}</h3>
      <div className="yt-ratio-tiles" role="radiogroup" aria-label={t('aspectRatio')}>
        {RATIOS.map((ratio) => (
          <button
            key={ratio.value}
            type="button"
            role="radio"
            aria-checked={value === ratio.value}
            aria-label={ratio.value}
            className="yt-ratio-tile"
            onClick={() => onChange(ratio.value)}
          >
            <span
              className="yt-ratio-tile__glyph"
              aria-hidden="true"
              style={{ width: ratio.width, height: ratio.height }}
            />
            <span>{ratio.value}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
