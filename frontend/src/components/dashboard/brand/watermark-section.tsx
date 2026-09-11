'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Link } from '@/i18n/navigation'
import {
  ArrowUpRight,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Lock,
  Stamp
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { SectionHeading } from './section-heading'
import type { BrandKit, BrandKitUpdate } from './types'

const POSITIONS = [
  { value: 'top-left', label: 'topLeft', icon: CornerUpLeft },
  { value: 'top-right', label: 'topRight', icon: CornerUpRight },
  { value: 'bottom-left', label: 'bottomLeft', icon: CornerDownLeft },
  { value: 'bottom-right', label: 'bottomRight', icon: CornerDownRight }
] as const

export function WatermarkSection({
  kit,
  canWhiteLabel,
  update
}: {
  kit: BrandKit
  canWhiteLabel: boolean
  update: BrandKitUpdate
}) {
  const t = useTranslations('brand')

  return (
    <Card
      id="brand-watermark"
      as="section"
      className="brand-section p-5 sm:p-6"
    >
      <SectionHeading
        icon={Stamp}
        eyebrow={t('videoEyebrow')}
        title={t('watermark')}
        description={t('watermarkDesc')}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr_1.15fr]">
        <div>
          <Label className="text-xs text-muted-foreground">
            {t('position')}
          </Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {POSITIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant={
                  kit.watermarkPosition === value ? 'default' : 'outline'
                }
                onClick={() => update('watermarkPosition', value)}
                className="h-10 rounded-lg px-2 text-[11px]"
              >
                <Icon />
                {t(label)}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              {t('opacity')}
            </Label>
            <span className="text-xs tabular-nums">
              {Math.round(kit.watermarkOpacity * 100)}%
            </span>
          </div>
          <Slider
            aria-label={t('opacity')}
            min={10}
            max={100}
            value={[Math.round(kit.watermarkOpacity * 100)]}
            onValueChange={([value = 80]) =>
              update('watermarkOpacity', value / 100)
            }
            className="mt-3 w-full"
          />
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {t('opacityHint')}
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {!canWhiteLabel && (
                <Lock className="size-3.5 text-muted-foreground" />
              )}
              {t('platformBadge')}
            </div>
            <Switch
              checked={!canWhiteLabel || !kit.hidePlatformBadge}
              disabled={!canWhiteLabel}
              aria-label={t('platformBadge')}
              onCheckedChange={(visible) =>
                update('hidePlatformBadge', !visible)
              }
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {canWhiteLabel ? t('badgeOnDesc') : t('badgeLockedDesc')}
          </p>
          {!canWhiteLabel && (
            <Link
              href="/dashboard/billing"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              {t('upgradeAgency')}
              <ArrowUpRight className="size-3" />
            </Link>
          )}
        </div>
      </div>
    </Card>
  )
}
