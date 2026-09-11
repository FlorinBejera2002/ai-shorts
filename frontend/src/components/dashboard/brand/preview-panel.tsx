'use client'

import { BrandLogo } from '@/components/shared/brand-logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Check, MonitorPlay } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useState } from 'react'

import { PREVIEW_RATIOS } from './constants'
import type { BrandKit, PreviewRatio } from './types'
import { brandCompletion, colorWithOpacity } from './utils'

function watermarkPosition(position: string) {
  switch (position) {
    case 'top-left':
      return 'top-3 left-3'
    case 'top-right':
      return 'top-3 right-3'
    case 'bottom-left':
      return 'bottom-3 left-3'
    default:
      return 'bottom-3 right-3'
  }
}

function subtitlePosition(position: string) {
  if (position === 'top') return 'top-[15%]'
  if (position === 'center') return 'top-1/2 -translate-y-1/2'
  return 'bottom-[15%]'
}

export function PreviewPanel({
  kit,
  logoUrl,
  canWhiteLabel
}: {
  kit: BrandKit
  logoUrl: string | null
  canWhiteLabel: boolean
}) {
  const t = useTranslations('brand')
  const [ratio, setRatio] = useState<PreviewRatio>('9:16')
  const activeRatio =
    PREVIEW_RATIOS.find((item) => item.value === ratio) ?? PREVIEW_RATIOS[0]!
  const completion = brandCompletion(kit)
  const hasBrandColors = kit.applyBrandColors
  const previewPrimary = hasBrandColors ? kit.primaryColor : '#334155'
  const previewSecondary = hasBrandColors ? kit.secondaryColor : '#94A3B8'

  return (
    <aside className="brand-inspector w-full xl:sticky xl:top-20">
      <Card className="brand-preview-card gap-3 overflow-hidden p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MonitorPlay className="size-4 text-primary" />
            {t('preview')}
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            {t('live')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-md border border-border/70 bg-card p-1">
          {PREVIEW_RATIOS.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant="ghost"
              aria-pressed={ratio === item.value}
              onClick={() => setRatio(item.value)}
              className={`h-8 rounded-sm px-2 text-[10px] ${
                ratio === item.value
                  ? 'bg-background text-foreground shadow-sm hover:bg-background'
                  : 'text-muted-foreground'
              }`}
            >
              {item.value}
            </Button>
          ))}
        </div>

        <div className="brand-preview-stage flex items-center justify-center rounded-md border border-border/60 p-2.5">
          <div
            className={`brand-preview-canvas relative w-full overflow-hidden rounded-md border border-white/15 shadow-xl ring-1 ring-black/5 transition-all duration-300 ${ratio === '9:16' ? 'max-w-[160px]' : 'max-w-[240px]'} ${activeRatio.aspect}`}
            style={{
              background: `linear-gradient(145deg, ${previewPrimary}, #111827 72%)`
            }}
          >
            <div
              aria-hidden="true"
              className="brand-preview-fluid brand-preview-fluid-primary"
              style={{ backgroundColor: previewPrimary }}
            />
            <div
              aria-hidden="true"
              className="brand-preview-fluid brand-preview-fluid-secondary"
              style={{ backgroundColor: previewSecondary }}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/12 to-transparent" />
            <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:24px_24px]" />
            {hasBrandColors && (
              <div className="absolute inset-x-[12%] top-[31%] text-white">
                <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/65">
                  {t('sampleKicker')}
                </p>
                <p
                  className="mt-1.5 text-lg font-semibold leading-[1.02] tracking-[-0.04em]"
                  style={{
                    fontFamily: kit.applyBrandFont ? kit.fontFamily : undefined
                  }}
                >
                  {t('sampleHeadline')}
                </p>
                <span
                  className="mt-3 block h-1 w-10 rounded-full"
                  style={{ backgroundColor: previewSecondary }}
                />
              </div>
            )}
            <div
              className={`absolute inset-x-3 flex justify-center ${subtitlePosition(kit.subtitlePosition)}`}
            >
              <span
                className="rounded-md px-2.5 py-1 text-center text-[10px] font-semibold leading-snug"
                style={{
                  color: kit.subtitleColor,
                  backgroundColor: colorWithOpacity(
                    kit.subtitleBgColor,
                    kit.subtitleBgOpacity
                  ),
                  fontFamily: kit.subtitleFont.split(' ')[0]
                }}
              >
                {t('sampleSubtitle')}
              </span>
            </div>
            <div
              className={`absolute ${watermarkPosition(kit.watermarkPosition)}`}
              style={{ opacity: kit.watermarkOpacity }}
            >
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={t('yourLogo')}
                  width={62}
                  height={24}
                  unoptimized={true}
                  className="h-6 max-w-[62px] object-contain"
                />
              ) : (
                <span className="text-[9px] font-bold text-white">
                  {t('yourLogo')}
                </span>
              )}
            </div>
            {(!canWhiteLabel || !kit.hidePlatformBadge) && (
              <div className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[7px] font-semibold leading-none text-white/70">
                <span>{t('madeWith')}</span>
                <BrandLogo variant="white-text" size="xs" />
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border/70 pt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold">{t('kitReadiness')}</p>
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {completion}%
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${completion}%` }}
            />
          </div>
          {completion === 100 && (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-success">
              <Check className="size-3" />
              {t('readyToApply')}
            </p>
          )}
        </div>
      </Card>
    </aside>
  )
}
