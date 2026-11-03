'use client'

import { ChevronDown, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { ScriptPlatformBadge } from './script-badges'
import { ScriptChoiceChips } from './script-choice-chips'
import {
  SCRIPT_DURATIONS,
  SCRIPT_LANGUAGES,
  SCRIPT_STYLES,
  SCRIPT_TONES,
  matchChoice
} from './script-options'
import { ScriptPlatformSelect } from './script-platform-select'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import shared from './scripts-workspace.module.css'
import styles from './script-brief.module.css'

export function ScriptBrief({ workspace: w }: { workspace: ScriptsWorkspace }) {
  const t = useTranslations('scriptGenerator')
  const locale = useLocale()
  const [expanded, setExpanded] = useState(false)
  const hasScenes = w.script.scenes.length > 0
  const open = !hasScenes || expanded
  const languageNames = new Intl.DisplayNames([locale], { type: 'language' })
  const tones = SCRIPT_TONES.map(([value, key]) => ({ value, label: t(key) }))
  const styleOptions = SCRIPT_STYLES.map(([value, key]) => ({
    value,
    label: t(key)
  }))
  const optionLabel = (options: { value: string; label: string }[], value: string) =>
    matchChoice(options, value)?.label ?? value
  const summary = [
    t('workspace.secondsSpaced', { count: w.duration }),
    optionLabel(tones, w.tone),
    optionLabel(styleOptions, w.style)
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      className={styles.brief}
      aria-labelledby="script-brief-heading"
      data-script-brief=""
      data-expanded={open}
    >
      <h2 id="script-brief-heading" className={styles.heading}>
        {t('workspace.brief')}
      </h2>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls="script-brief-fields"
        data-brief-toggle=""
        onClick={() => setExpanded(!open)}
      >
        <ScriptPlatformBadge platform={w.platform} decorative />
        <span className={styles.toggleText}>
          <span>{t('workspace.brief')}</span>
          <span className={styles.toggleSummary}>{summary}</span>
        </span>
        <ChevronDown aria-hidden="true" className={styles.toggleIcon} />
      </button>
      <div id="script-brief-fields" className={styles.fields}>
        <div className={shared.field}>
          <label htmlFor="script-topic">{t('topicLabel')}</label>
          <textarea
            id="script-topic"
            className={`${shared.control} ${styles.topic}`}
            value={w.topic}
            maxLength={1000}
            rows={3}
            placeholder={t('topicPlaceholder')}
            onChange={(event) => w.setTopic(event.target.value)}
          />
        </div>
        <ScriptPlatformSelect
          value={w.platform}
          onValueChange={w.setPlatform}
          label={t('platformLabel')}
          placeholder={t('platformRequired')}
        />
        <div className={styles.pair}>
          <div className={shared.field}>
            <label htmlFor="script-duration">{t('durationLabel')}</label>
            <select
              id="script-duration"
              className={shared.control}
              value={w.duration}
              onChange={(event) => w.setDuration(Number(event.target.value))}
            >
              {(SCRIPT_DURATIONS.includes(w.duration)
                ? SCRIPT_DURATIONS
                : [...SCRIPT_DURATIONS, w.duration].sort((a, b) => a - b)
              ).map((value) => (
                <option key={value} value={value}>
                  {t('workspace.secondsSpaced', { count: value })}
                </option>
              ))}
            </select>
          </div>
          <div className={shared.field}>
            <label htmlFor="script-language">{t('languageLabel')}</label>
            <select
              id="script-language"
              className={shared.control}
              value={w.language}
              onChange={(event) => w.setLanguage(event.target.value)}
            >
              {(SCRIPT_LANGUAGES.includes(w.language)
                ? SCRIPT_LANGUAGES
                : [...SCRIPT_LANGUAGES, w.language]
              ).map((value) => (
                <option key={value} value={value}>
                  {languageNames.of(value) ?? value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ScriptChoiceChips
          id="script-tone"
          label={t('toneLabel')}
          options={tones}
          value={w.tone}
          onValueChange={w.setTone}
        />
        <ScriptChoiceChips
          id="script-style"
          label={t('styleLabel')}
          options={styleOptions}
          value={w.style}
          onValueChange={w.setStyle}
        />
        <div className={shared.field}>
          <label htmlFor="script-audience">{t('audienceLabel')}</label>
          <input
            id="script-audience"
            className={shared.control}
            value={w.audience}
            placeholder={t('audiencePlaceholder')}
            onChange={(event) => w.setAudience(event.target.value)}
          />
        </div>
        <button
          type="button"
          className={`${shared.primaryButton} ${styles.generate}`}
          onClick={w.generate}
          disabled={w.generating}
          data-script-generate=""
        >
          {w.generating ? (
            <span className={shared.spinner} aria-hidden="true" />
          ) : (
            <Sparkles aria-hidden="true" />
          )}
          {t(
            w.generating
              ? 'generating'
              : hasScenes
                ? 'workspace.regenerate'
                : 'generateButton'
          )}
        </button>
      </div>
    </section>
  )
}
