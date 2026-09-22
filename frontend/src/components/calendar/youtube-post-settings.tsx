'use client'

import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { YouTubePublishingOptions } from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'

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
    <fieldset
      disabled={disabled}
      className="space-y-4 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-semibold">{t('heading')}</legend>
      <p className="text-sm">{t('channel', { name: channelNames })}</p>
      <label className="block space-y-2 text-sm" htmlFor={`${idPrefix}-title`}>
        <span>{t('title')}</span>
        <Input
          id={`${idPrefix}-title`}
          value={settings.title}
          onChange={(event) => update('title', event.target.value)}
        />
      </label>
      <label
        className="block space-y-2 text-sm"
        htmlFor={`${idPrefix}-description`}
      >
        <span>{t('description')}</span>
        <Textarea
          id={`${idPrefix}-description`}
          value={settings.description}
          maxLength={5000}
          onChange={(event) => update('description', event.target.value)}
        />
      </label>
      <label
        className="block space-y-2 text-sm"
        htmlFor={`${idPrefix}-privacy`}
      >
        <span>{t('privacy')}</span>
        <Select
          disabled={disabled}
          value={settings.privacyStatus}
          onValueChange={(value) =>
            update(
              'privacyStatus',
              value as YouTubePublishingOptions['privacyStatus']
            )
          }
        >
          <SelectTrigger id={`${idPrefix}-privacy`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">{t('private')}</SelectItem>
            <SelectItem value="unlisted" disabled={!auditApproved}>
              {t('unlisted')}
            </SelectItem>
            <SelectItem value="public" disabled={!auditApproved}>
              {t('public')}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
      {!auditApproved && (
        <p className="rounded-md bg-muted p-3 text-xs">
          {t('auditRestriction')}
        </p>
      )}
      {(['madeForKids', 'containsSyntheticMedia'] as const).map((key) => (
        <label
          key={key}
          className="block space-y-2 text-sm"
          htmlFor={`${idPrefix}-${key}`}
        >
          <span>{t(key)}</span>
          <Select
            disabled={disabled}
            value={settings[key] === null ? '' : String(settings[key])}
            onValueChange={(value) => update(key, value === 'true')}
          >
            <SelectTrigger id={`${idPrefix}-${key}`} className="w-full">
              <SelectValue placeholder={t('choose')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">{t('yes')}</SelectItem>
              <SelectItem value="false">{t('no')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
      ))}
      <label className="flex items-start gap-2 text-sm">
        <Switch
          disabled={disabled}
          checked={settings.notifySubscribers}
          onCheckedChange={(checked) => update('notifySubscribers', checked)}
        />
        {t('notifySubscribers')}
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Switch
          disabled={disabled}
          checked={settings.termsAccepted}
          onCheckedChange={(checked) => update('termsAccepted', checked)}
        />
        <span>
          {t.rich('reviewConsent', {
            terms: (chunks) => (
              <a
                className="underline"
                target="_blank"
                rel="noreferrer"
                href="https://www.youtube.com/t/terms"
              >
                {chunks}
              </a>
            )
          })}
        </span>
      </label>
    </fieldset>
  )
}
