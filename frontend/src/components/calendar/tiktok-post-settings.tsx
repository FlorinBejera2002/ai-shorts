'use client'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { TikTokCreatorOptionsState } from '@/hooks/use-tiktok-creator-options'
import type { PublishingData } from '@/lib/publishing'
import type { PublishingMedia } from '@/lib/content-calendar'
import type { TikTokDirectPostSettings } from '@/lib/tiktok-direct-post'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TikTokCoverSettings } from './tiktok-cover-settings'
import { OptionsGroup, OptionsRow } from './post-options-ui'
import { PostSettingsSection } from './post-settings-section'
import styles from './post-platform-options.module.css'

type TikTokOptions = NonNullable<TikTokCreatorOptionsState['value']>
type TikTokChange = <Key extends keyof TikTokDirectPostSettings>(
  key: Key,
  value: TikTokDirectPostSettings[Key]
) => void

interface TikTokSectionProps {
  disabled: boolean
  idPrefix: string
  onChange: TikTokChange
  options: TikTokOptions
  settings: TikTokDirectPostSettings
}

function SettingRow({
  checked,
  disabled,
  id,
  label,
  nested = false,
  onCheckedChange
}: {
  checked: boolean
  disabled?: boolean
  id: string
  label: string
  nested?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <OptionsRow
      htmlFor={id}
      nested={nested}
      label={label}
      control={<Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />}
    />
  )
}

function TikTokStatus({
  optionsState,
  disabled,
  onRetry
}: {
  optionsState: TikTokCreatorOptionsState
  disabled: boolean
  onRetry: () => void
}) {
  const t = useTranslations('publishing')
  if (optionsState.status === 'loading') {
    return (
      <div role="status" className="flex items-center gap-2 text-xs">
        <LoadingIndicator className="size-4" />
        {t('loadingOptions')}
      </div>
    )
  }
  if (optionsState.status !== 'error') return null
  return (
    <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{optionsState.error}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={disabled}>
        <RefreshCw className="size-3" />
        {t('retry')}
      </Button>
    </div>
  )
}

function TikTokVisibility({ disabled, idPrefix, onChange, options, settings }: TikTokSectionProps) {
  const t = useTranslations('publishing')
  return (
    <section className={styles.group} aria-labelledby={`${idPrefix}-visibility`}>
      <h3 id={`${idPrefix}-visibility`} className={styles.groupLabel}>
        {t('optionsGroupVisibility')}
      </h3>
      <div className={styles.choiceGrid}>
        {options.privacyLevels.map(level => (
          <button
            key={level}
            type="button"
            disabled={disabled}
            onClick={() => onChange('privacyLevel', level)}
            aria-pressed={settings.privacyLevel === level}
            className={styles.choice}
          >
            {t.has(`privacyLevels.${level}`) ? t(`privacyLevels.${level}`) : level}
          </button>
        ))}
      </div>
    </section>
  )
}

function TikTokInteractions({
  disabled, idPrefix, isPhotoPost, onChange, options, settings
}: TikTokSectionProps & { isPhotoPost: boolean }) {
  const t = useTranslations('publishing')
  return (
    <OptionsGroup label={t('optionsGroupInteractions')}>
      <SettingRow
        id={`${idPrefix}-comments`}
        label={t('comments')}
        checked={settings.allowComment && !options.commentDisabled}
        disabled={disabled || options.commentDisabled}
        onCheckedChange={checked => onChange('allowComment', checked)}
      />
      {!isPhotoPost && (
        <>
          <SettingRow
            id={`${idPrefix}-duet`}
            label={t('duet')}
            checked={settings.allowDuet && !options.duetDisabled}
            disabled={disabled || options.duetDisabled}
            onCheckedChange={checked => onChange('allowDuet', checked)}
          />
          <SettingRow
            id={`${idPrefix}-stitch`}
            label={t('stitch')}
            checked={settings.allowStitch && !options.stitchDisabled}
            disabled={disabled || options.stitchDisabled}
            onCheckedChange={checked => onChange('allowStitch', checked)}
          />
        </>
      )}
    </OptionsGroup>
  )
}

function TikTokDisclosures({ disabled, idPrefix, onChange, settings }: TikTokSectionProps) {
  const t = useTranslations('publishing')
  return (
    <OptionsGroup label={t('optionsGroupDisclosures')}>
      <SettingRow
        id={`${idPrefix}-commercial`}
        label={t('commercial')}
        checked={settings.commercialContent}
        disabled={disabled}
        onCheckedChange={checked => onChange('commercialContent', checked)}
      />
      {settings.commercialContent && (
        <>
          <SettingRow
            id={`${idPrefix}-own-brand`}
            label={t('ownBrand')}
            nested
            checked={settings.ownBrand}
            disabled={disabled}
            onCheckedChange={checked => onChange('ownBrand', checked)}
          />
          <SettingRow
            id={`${idPrefix}-branded-content`}
            label={t('paidBrand')}
            nested
            checked={settings.brandedContent}
            disabled={disabled || settings.privacyLevel === 'SELF_ONLY'}
            onCheckedChange={checked => onChange('brandedContent', checked)}
          />
        </>
      )}
      <SettingRow
        id={`${idPrefix}-aigc`}
        label={t('aigc')}
        checked={settings.isAigc}
        disabled={disabled}
        onCheckedChange={checked => onChange('isAigc', checked)}
      />
    </OptionsGroup>
  )
}

function TikTokConsent({ disabled, onChange, settings }: Pick<TikTokSectionProps, 'disabled' | 'onChange' | 'settings'>) {
  const t = useTranslations('publishing')
  return (
    <label className={styles.consent}>
      <button
        type="button"
        role="checkbox"
        aria-label={t('consent')}
        aria-checked={settings.policyConsent}
        disabled={disabled}
        onClick={() => onChange('policyConsent', !settings.policyConsent)}
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
          settings.policyConsent
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        {settings.policyConsent && <Check className="size-3" strokeWidth={3} />}
      </button>
      <span>
        {t('consent')}{' '}
        <a
          href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-4"
        >
          {t('musicTerms')}
        </a>
        {settings.brandedContent && (
          <>
            {' '}
            {t('and')}{' '}
            <a
              href="https://www.tiktok.com/legal/page/global/bc-policy/en"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              {t('brandTerms')}
            </a>
          </>
        )}
        .
      </span>
    </label>
  )
}

export function TikTokPostSettings({
  clip,
  media = [],
  isPhotoPost = false,
  disabled,
  idPrefix,
  onChange,
  onRetry,
  optionsState,
  settings
}: {
  clip?: PublishingData['clips'][number]
  media?: PublishingMedia[]
  isPhotoPost?: boolean
  disabled: boolean
  idPrefix: string
  onChange: TikTokChange
  onRetry: () => void
  optionsState: TikTokCreatorOptionsState
  settings: TikTokDirectPostSettings
}) {
  const t = useTranslations('publishing')
  const options = optionsState.value
  const sectionProps = { disabled, idPrefix, onChange, settings }

  return (
    <PostSettingsSection idPrefix={idPrefix} provider="tiktok" title={t('tiktokOptions')} subtitle="TikTok">
      <TikTokStatus optionsState={optionsState} disabled={disabled} onRetry={onRetry} />
      {options && (
        <div className={styles.optionsColumns}>
          <div className={styles.optionsColumn}>
            <TikTokVisibility {...sectionProps} options={options} />
            <TikTokInteractions {...sectionProps} options={options} isPhotoPost={isPhotoPost} />
          </div>
          <div className={styles.optionsColumn}>
            <TikTokDisclosures {...sectionProps} options={options} />
            <TikTokCoverSettings
              idPrefix={idPrefix}
              media={media}
              isPhotoPost={isPhotoPost}
              disabled={disabled}
              maxDuration={clip?.duration ?? options.maxDuration}
              settings={settings}
              onChange={onChange}
            />
            {isPhotoPost && (
              <OptionsGroup>
                <SettingRow
                  id={`${idPrefix}-auto-music`}
                  label={t('autoAddMusic')}
                  checked={settings.autoAddMusic}
                  disabled={disabled}
                  onCheckedChange={checked => onChange('autoAddMusic', checked)}
                />
              </OptionsGroup>
            )}
            <TikTokConsent disabled={disabled} onChange={onChange} settings={settings} />
          </div>
        </div>
      )}
    </PostSettingsSection>
  )
}
