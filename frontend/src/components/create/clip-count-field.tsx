'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  AUTO_CLIP_COUNT,
  CLIP_COUNT_PRESETS,
  MAX_CLIP_COUNT,
  MIN_CLIP_COUNT,
  parseManualClipCount
} from './youtube-creation-model'

interface ClipCountFieldProps {
  clips: number
  onChange: (clips: number) => void
}

/** Auto, three presets, or a manual count between 1 and 30 in the "Altul" field. */
export function ClipCountField({ clips, onChange }: ClipCountFieldProps) {
  const t = useTranslations('create')
  const groupLabelId = useId()
  const isPreset = (CLIP_COUNT_PRESETS as readonly number[]).includes(clips)
  const isManual = !isPreset
  const [manualText, setManualText] = useState(isManual ? String(clips) : '')
  const shownManual = isManual ? String(clips) : manualText

  function choosePreset(value: number) {
    setManualText('')
    onChange(value)
  }

  function changeManual(text: string) {
    setManualText(text)
    const parsed = parseManualClipCount(text)
    if (parsed !== null) onChange(parsed)
  }

  return (
    <section className="yt-inspector-section" aria-labelledby={groupLabelId}>
      <h3 id={groupLabelId}>{t('clipsPerVideo')}</h3>
      <div className="yt-clip-count">
        <div className="yt-segment yt-clip-count__presets" role="radiogroup" aria-label={t('clipsPerVideo')}>
          {CLIP_COUNT_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={clips === value}
              onClick={() => choosePreset(value)}
            >
              {value === AUTO_CLIP_COUNT ? t('clipsAuto') : value}
            </button>
          ))}
        </div>
        <label className="yt-clip-count__manual">
          <span className="sr-only">{t('manualClipCountLabel')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_CLIP_COUNT}
            max={MAX_CLIP_COUNT}
            step={1}
            placeholder={t('clipsOther')}
            aria-label={t('manualClipCountLabel')}
            value={shownManual}
            onChange={(event) => changeManual(event.target.value)}
          />
        </label>
      </div>
    </section>
  )
}
