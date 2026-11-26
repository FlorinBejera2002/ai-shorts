'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { SettingsPanel } from './settings-panel'
import { SummaryCard } from './summary-card'
import { YouTubeSourceCard } from './youtube-source-card'
import { useYouTubeLink } from './use-youtube-link'

export function YouTubeLinkWorkflow({ active }: { active: boolean }) {
  const t = useTranslations('create.youtubeLink')
  const fieldId = useId()
  const link = useYouTubeLink()

  return (
    <form
      className="yt-path"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (active) void link.generate()
      }}
    >
      <div className="yt-path__main">
        <YouTubeSourceCard title={t('pasteLink')} aside={t('quality')}>
          <div className="yt-link-field">
            <label htmlFor={fieldId}>{t('label')}</label>
            <input
              id={fieldId}
              type="url"
              name="youtube_url"
              autoComplete="url"
              spellCheck={false}
              placeholder="https://www.youtube.com/watch?v=…"
              value={link.url}
              maxLength={2048}
              disabled={link.busy}
              aria-invalid={link.error === 'invalid'}
              aria-describedby={`${fieldId}-hint ${fieldId}-error`}
              onChange={(event) => link.changeUrl(event.target.value)}
            />
            <p id={`${fieldId}-hint`}>{t('hint')}</p>
            <p id={`${fieldId}-error`} className="yt-link-field__error" role="alert">
              {link.error ? t(link.error) : '\u00a0'}
            </p>
          </div>
        </YouTubeSourceCard>
      </div>
      <aside className="yt-inspector" data-testid="youtube-link-settings">
        <SettingsPanel settings={link.settings} onChange={link.setSettings} />
        <SummaryCard
          videoCount={1}
          creditCost={link.creditCost}
          canGenerate={link.url.trim().length > 0}
          busy={link.busy}
          limitReached={link.limitReached}
          actionType="submit"
        />
      </aside>
    </form>
  )
}
