'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Switch } from '@/components/ui/switch'
import type { TikTokCreatorOptionsState } from '@/hooks/use-tiktok-creator-options'
import type { PublishingData } from '@/lib/publishing'
import type { TikTokDirectPostSettings } from '@/lib/tiktok-direct-post'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, ChevronDown, Film, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { PlatformOptionIcon } from './platform-mark'

function SettingRow({
  checked,
  description,
  disabled,
  id,
  label,
  onCheckedChange
}: {
  checked: boolean
  description?: string
  disabled?: boolean
  id: string
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border bg-background p-3">
      <Label htmlFor={id} className="min-w-0 cursor-pointer text-sm">
        <span className="block font-medium text-foreground">{label}</span>
        {description && (
          <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
            {description}
          </span>
        )}
      </Label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="mt-0.5"
      />
    </div>
  )
}

export function TikTokPostSettings({
  clip,
  isPhotoPost = false,
  disabled,
  idPrefix,
  onChange,
  onRetry,
  optionsState,
  settings
}: {
  clip?: PublishingData['clips'][number]
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
  const [expanded, setExpanded] = useState(false)
  const reduceMotion = useReducedMotion()

  return (
    <section
      aria-labelledby={`${idPrefix}-title`}
      className="overflow-hidden rounded-md border bg-muted/20"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
      >
        <PlatformOptionIcon platform="tiktok" />
        <div className="min-w-0 flex-1">
          <h3 id={`${idPrefix}-title`} className="text-sm font-semibold">
            {t('tiktokOptions')}
          </h3>
          {options && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('postingAs', { name: options.nickname })}
            </p>
          )}
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChevronDown className="size-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t px-4 pb-4 pt-4">
              {clip && (
                <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
                  <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-black text-white/70">
                    {clip.fileUrl ? (
                      <video
                        key={clip.id}
                        src={clip.fileUrl}
                        poster={clip.thumbnailUrl}
                        controls={true}
                        preload="metadata"
                        aria-label={clip.title}
                        className="size-full object-contain"
                      >
                        <track kind="captions" />
                      </video>
                    ) : clip.thumbnailUrl ? (
                      <img
                        src={clip.thumbnailUrl}
                        alt={clip.title}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Film className="size-6" aria-hidden={true} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {t('selectedClip')}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">
                      {clip.title}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {t('clipDuration', {
                        seconds: Math.round(clip.duration)
                      })}
                    </p>
                  </div>
                </div>
              )}

              {optionsState.status === 'loading' && (
                <div role="status" className="flex items-center gap-2 text-xs">
                  <LoadingIndicator className="size-4" />
                  {t('loadingOptions')}
                </div>
              )}

              {optionsState.status === 'error' && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/25 bg-destructive/[0.055] p-3 text-xs text-destructive"
                >
                  <AlertTriangle className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">{optionsState.error}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    disabled={disabled}
                  >
                    <RefreshCw className="size-3.5" />
                    {t('retry')}
                  </Button>
                </div>
              )}

              {options && (
                <>
                  <div>
                    <Label
                      htmlFor={`${idPrefix}-privacy`}
                      className="text-xs"
                    >
                      {t('privacy')}
                    </Label>
                    <select
                      id={`${idPrefix}-privacy`}
                      value={settings.privacyLevel}
                      onChange={(event) =>
                        onChange('privacyLevel', event.target.value)
                      }
                      disabled={disabled}
                      className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      <option value="">{t('choosePrivacy')}</option>
                      {options.privacyLevels.map((level) => (
                        <option key={level} value={level}>
                          {t.has(`privacyLevels.${level}`)
                            ? t(`privacyLevels.${level}`)
                            : level}
                        </option>
                      ))}
                    </select>
                  </div>

                  <fieldset>
                    <legend className="text-xs font-semibold">
                      {t('interactions')}
                    </legend>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {t('interactionHint')}
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
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
                  </fieldset>

                  <div className="space-y-2">
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
                      <div className="space-y-2 pl-3">
                        <p className="text-[11px] leading-5 text-muted-foreground">
                          {t('brandHint')}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
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
                            description={
                              settings.privacyLevel === 'SELF_ONLY'
                                ? t('brandPrivacyDisabled')
                                : undefined
                            }
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
                      </div>
                    )}
                  </div>

                  {isPhotoPost ? (
                    <SettingRow
                      id={`${idPrefix}-auto-music`}
                      label={t('autoAddMusic')}
                      description={t('autoAddMusicHint')}
                      checked={settings.autoAddMusic}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange('autoAddMusic', checked)
                      }
                    />
                  ) : (
                    <SettingRow
                      id={`${idPrefix}-aigc`}
                      label={t('aigc')}
                      description={t('aigcHint')}
                      checked={settings.isAigc}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange('isAigc', checked)
                      }
                    />
                  )}

                  <label className="flex items-start gap-2 rounded-md border bg-background p-3 text-xs leading-5">
                    <input
                      type="checkbox"
                      checked={settings.policyConsent}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange('policyConsent', event.target.checked)
                      }
                      className="mt-0.5 size-4 accent-foreground"
                    />
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
