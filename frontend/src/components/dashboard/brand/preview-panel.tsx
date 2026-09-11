'use client'

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
  canWhiteLabel
}: {
  kit: BrandKit
  canWhiteLabel: boolean
}) {
  const t = useTranslations('brand')
  const [ratio, setRatio] = useState<PreviewRatio>('9:16')
  const activeRatio =
    PREVIEW_RATIOS.find((item) => item.value === ratio) ?? PREVIEW_RATIOS[0]!
  const completion = brandCompletion(kit)

  return (
    <aside className="brand-inspector w-full xl:sticky xl:top-24">
      <Card className="brand-preview-card overflow-hidden p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MonitorPlay className="size-4 text-primary" />
              {t('preview')}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('previewLive')}
            </p>
          </div>
          <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[10px] font-semibold">
            {t('live')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/70 p-1">
          {PREVIEW_RATIOS.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant="ghost"
              aria-pressed={ratio === item.value}
              onClick={() => setRatio(item.value)}
              className={`h-8 rounded-md px-2 text-[10px] ${
                ratio === item.value
                  ? 'bg-background text-foreground shadow-sm hover:bg-background'
                  : 'text-muted-foreground'
              }`}
            >
              {item.value}
            </Button>
          ))}
        </div>

        <div className="brand-preview-stage flex min-h-[390px] items-center justify-center rounded-xl p-5">
          <div
            className={`brand-preview-canvas relative w-full max-w-[228px] overflow-hidden rounded-[20px] border border-white/10 shadow-2xl transition-all ${activeRatio.aspect}`}
            style={{
              background: `radial-gradient(circle at 72% 18%, ${kit.secondaryColor}66, transparent 33%), linear-gradient(145deg, ${kit.primaryColor}, #111827 72%)`
            }}
          >
            <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:24px_24px]" />
            <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-white/75 backdrop-blur">
              sneepcut studio
            </div>
            <div className="absolute inset-x-[12%] top-[31%] text-white">
              <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/65">
                {t('sampleKicker')}
              </p>
              <p
                className="mt-1.5 text-xl font-semibold leading-[1.02] tracking-[-0.04em]"
                style={{ fontFamily: kit.fontFamily }}
              >
                {t('sampleHeadline')}
              </p>
              <span
                className="mt-3 block h-1 w-10 rounded-full"
                style={{ backgroundColor: kit.secondaryColor }}
              />
            </div>
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
              {kit.logoUrl ? (
                <Image
                  src={kit.logoUrl}
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
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[7px] font-semibold text-white/55">
                {t('madeWithSneepcut')}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/55 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold">{t('kitReadiness')}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t('readinessHint')}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {completion}%
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
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
