'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import type { TikTokCreatorOptionsState } from '@/hooks/use-tiktok-creator-options'
import type { PublishingData } from '@/lib/publishing'
import type { TikTokDirectPostSettings } from '@/lib/tiktok-direct-post'
import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

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
    <div className="flex items-center justify-between gap-3 py-1">
      <Label htmlFor={id} className="cursor-pointer text-xs text-foreground">
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
  clip: _clip,
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
      className="overflow-hidden rounded-lg border"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <PlatformBrandIcon provider="tiktok" className="h-5 w-5" />
        <div className="min-w-0 flex-1">
          <h3 id={`${idPrefix}-title`} className="text-xs font-semibold">
            {t('tiktokOptions')}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            TikTok
          </p>
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
            <div className="space-y-3 border-t px-4 py-3">
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
                          className={cn(
                            'rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                            settings.privacyLevel === level
                              ? 'border-foreground bg-foreground text-background'
                              : 'border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground',
                            disabled && 'cursor-not-allowed opacity-60'
                          )}
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

                  {isPhotoPost ? (
                    <SettingRow
                      id={`${idPrefix}-auto-music`}
                      label={t('autoAddMusic')}
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
                      checked={settings.isAigc}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange('isAigc', checked)
                      }
                    />
                  )}

                  <label className="flex items-start gap-2 pt-1 text-[11px] leading-5 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={settings.policyConsent}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange('policyConsent', event.target.checked)
                      }
                      className="mt-0.5 size-4 shrink-0 rounded-sm border border-border accent-foreground"
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
