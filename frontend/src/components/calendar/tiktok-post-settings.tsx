'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import type { TikTokCreatorOptionsState } from '@/hooks/use-tiktok-creator-options'
import type { PublishingData } from '@/lib/publishing'
import type { PublishingMedia } from '@/lib/content-calendar'
import type { TikTokDirectPostSettings } from '@/lib/tiktok-direct-post'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TikTokCoverSettings } from './tiktok-cover-settings'
import { PostSettingsSection } from './post-settings-section'
import styles from './post-platform-options.module.css'

function SettingRow({
  checked,
  disabled,
  id,
  label,
  onCheckedChange
}: {
  checked: boolean
  disabled?: boolean
  id: string
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className={styles.settingRow}>
      <Label htmlFor={id} className="cursor-pointer text-sm text-foreground">
        {label}
      </Label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
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
  onChange: <Key extends keyof TikTokDirectPostSettings>(
    key: Key,
    value: TikTokDirectPostSettings[Key]
  ) => void
  onRetry: () => void
  optionsState: TikTokCreatorOptionsState
  settings: TikTokDirectPostSettings
}) {
  const t = useTranslations('publishing')
  const options = optionsState.value

  return (
    <PostSettingsSection
      idPrefix={idPrefix}
      provider="tiktok"
      title={t('tiktokOptions')}
      subtitle="TikTok"
    >
      {optionsState.status === 'loading' && (
        <div role="status" className="flex items-center gap-2 text-xs">
          <LoadingIndicator className="size-4" />
          {t('loadingOptions')}
        </div>
      )}

      {optionsState.status === 'error' && (
        <div
          role="alert"
          className="flex items-center gap-2 text-xs text-destructive"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{optionsState.error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={disabled}
          >
            <RefreshCw className="size-3" />
            {t('retry')}
          </Button>
        </div>
      )}

      {options && (
        <>
          <fieldset>
            <legend className="text-xs font-medium">
              {t('privacy')}
            </legend>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {options.privacyLevels.map((level) => (
                <button
                  key={level}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange('privacyLevel', level)}
                  aria-pressed={settings.privacyLevel === level}
                  className={styles.choice}
                >
                  {t.has(`privacyLevels.${level}`)
                    ? t(`privacyLevels.${level}`)
                    : level}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1">
            <SettingRow
              id={`${idPrefix}-comments`}
              label={t('comments')}
              checked={
                settings.allowComment && !options.commentDisabled
              }
              disabled={disabled || options.commentDisabled}
              onCheckedChange={(checked) =>
                onChange('allowComment', checked)
              }
            />
            {!isPhotoPost && (
              <>
                <SettingRow
                  id={`${idPrefix}-duet`}
                  label={t('duet')}
                  checked={
                    settings.allowDuet && !options.duetDisabled
                  }
                  disabled={disabled || options.duetDisabled}
                  onCheckedChange={(checked) =>
                    onChange('allowDuet', checked)
                  }
                />
                <SettingRow
                  id={`${idPrefix}-stitch`}
                  label={t('stitch')}
                  checked={
                    settings.allowStitch && !options.stitchDisabled
                  }
                  disabled={disabled || options.stitchDisabled}
                  onCheckedChange={(checked) =>
                    onChange('allowStitch', checked)
                  }
                />
              </>
            )}
          </div>

          <SettingRow
            id={`${idPrefix}-commercial`}
            label={t('commercial')}
            checked={settings.commercialContent}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange('commercialContent', checked)
            }
          />
          {settings.commercialContent && (
            <div className="space-y-1 pl-3">
              <SettingRow
                id={`${idPrefix}-own-brand`}
                label={t('ownBrand')}
                checked={settings.ownBrand}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange('ownBrand', checked)
                }
              />
              <SettingRow
                id={`${idPrefix}-branded-content`}
                label={t('paidBrand')}
                checked={settings.brandedContent}
                disabled={
                  disabled ||
                  settings.privacyLevel === 'SELF_ONLY'
                }
                onCheckedChange={(checked) =>
                  onChange('brandedContent', checked)
                }
              />
            </div>
          )}

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
            <SettingRow
              id={`${idPrefix}-auto-music`}
              label={t('autoAddMusic')}
              checked={settings.autoAddMusic}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange('autoAddMusic', checked)
              }
            />
          )}
          <SettingRow
            id={`${idPrefix}-aigc`}
            label={t('aigc')}
            checked={settings.isAigc}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange('isAigc', checked)
            }
          />

          <label className="flex items-start gap-2 pt-1 text-[11px] leading-5 text-muted-foreground">
            <button
              type="button"
              role="checkbox"
              aria-label={t('consent')}
              aria-checked={settings.policyConsent}
              disabled={disabled}
              onClick={() =>
                onChange('policyConsent', !settings.policyConsent)
              }
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
        </>
      )}
    </PostSettingsSection>
  )
}
