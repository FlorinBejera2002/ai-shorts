'use client'

import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { YouTubePublishingOptions } from '@/lib/content-calendar'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { YouTubeAdvancedSettings } from './youtube-advanced-settings'
import styles from './post-platform-options.module.css'

interface YouTubePostSettingsProps {
  settings: YouTubePublishingOptions
  onChange: (settings: YouTubePublishingOptions) => void
  auditApproved: boolean
  channelNames: string
  disabled: boolean
  idPrefix: string
}

export function YouTubePostSettings({
  settings,
  onChange,
  auditApproved,
  channelNames,
  disabled,
  idPrefix
}: YouTubePostSettingsProps) {
  const t = useTranslations('youtubePublishing')
  const composerT = useTranslations('contentCalendar.composer')
  function update<Key extends keyof YouTubePublishingOptions>(
    key: Key,
    value: YouTubePublishingOptions[Key]
  ) {
    onChange({
      ...settings,
      [key]: value,
      ...(key !== 'termsAccepted' ? { termsAccepted: false } : {})
    })
  }

  return (
    <fieldset disabled={disabled} className="space-y-5">
      <legend className="sr-only">{t('heading')}</legend>
      <p className="sr-only">{t('channel', { name: channelNames })}</p>
      <label className="block space-y-2 text-sm" htmlFor={idPrefix + '-title'}>
        <span>{t('title')}</span>
        <Input id={idPrefix + '-title'} value={settings.title} onChange={event => update('title', event.target.value)} />
      </label>
      <fieldset>
        <legend className="mb-2 text-sm">{t('privacy')}</legend>
        <div className={styles.radioGroup}>
          {(['private', 'unlisted', 'public'] as const).map(value => (
            <label key={value}>
              <input
                type="radio"
                name={idPrefix + '-privacy'}
                value={value}
                checked={settings.privacyStatus === value}
                disabled={disabled || (value !== 'private' && !auditApproved)}
                onChange={() => update('privacyStatus', value)}
              />
              <span>{t(value)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {!auditApproved && <p className="rounded-md bg-muted p-3 text-xs">{t('auditRestriction')}</p>}
      {(['madeForKids', 'containsSyntheticMedia'] as const).map(key => (
        <fieldset key={key}>
          <legend className="mb-2 text-sm">{t(key)}</legend>
          <div className={styles.radioGroup}>
            {[true, false].map(value => (
              <label key={String(value)}>
                <input
                  type="radio"
                  name={idPrefix + '-' + key}
                  checked={settings[key] === value}
                  disabled={disabled}
                  onChange={() => update(key, value)}
                />
                <span>{t(value ? 'yes' : 'no')}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <label className={styles.settingRow}>
        <span>{t('notifySubscribers')}</span>
        <Switch disabled={disabled} checked={settings.notifySubscribers} onCheckedChange={checked => update('notifySubscribers', checked)} />
      </label>
      <details className={styles.more}>
        <summary>{composerT('moreOptions')}<ChevronDown className="size-4" aria-hidden="true" /></summary>
        <div className={styles.advanced}>
          <label className="block space-y-2 text-sm" htmlFor={idPrefix + '-description'}>
            <span>{t('description')}</span>
            <Textarea id={idPrefix + '-description'} value={settings.description} maxLength={5000} onChange={event => update('description', event.target.value)} />
          </label>
          <YouTubeAdvancedSettings settings={settings} onChange={update} idPrefix={idPrefix} disabled={disabled} />
        </div>
      </details>
      <label className="flex items-start gap-3 text-xs leading-5">
        <Switch disabled={disabled} checked={settings.termsAccepted} onCheckedChange={checked => update('termsAccepted', checked)} className="mt-0.5 shrink-0" />
        <span>
          {t.rich('reviewConsent', {
            terms: chunks => <a className="underline" target="_blank" rel="noreferrer" href="https://www.youtube.com/t/terms">{chunks}</a>
          })}
        </span>
      </label>
    </fieldset>
  )
}
