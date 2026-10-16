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
  Lock
} from 'lucide-react'
import { useTranslations } from 'next-intl'

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
      as="section"
      id="brand-watermark"
      className="@container/watermark min-w-0 gap-3 border-0 p-0 shadow-none"
    >
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>{t('watermarkEnabled')}</span>
        <Switch
          checked={kit.watermarkEnabled}
          onCheckedChange={(v) => update('watermarkEnabled', v)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {(['watermarkSize', 'watermarkMargin'] as const).map((key) => (
          <label key={key} className="grid gap-1 text-xs">
            {t(key)}
            <input
              type="number"
              min={key === 'watermarkSize' ? 1 : 0}
              max={key === 'watermarkSize' ? 50 : 20}
              value={Math.round(kit[key] * 100)}
              onChange={(e) => {
                if (key === 'watermarkMargin') {
                  update('watermarkX', null)
                  update('watermarkY', null)
                }
                update(
                  key,
                  Math.max(
                    key === 'watermarkSize' ? 0.01 : 0,
                    Math.min(
                      key === 'watermarkSize' ? 0.5 : 0.2,
                      Number(e.target.value) / 100
                    )
                  )
                )
              }}
              className="rounded-md border bg-background p-2"
            />
          </label>
        ))}
      </div>

      <div className="grid gap-3 @min-[520px]/watermark:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">
            {t('position')}
          </Label>
          <div className="mt-1 grid grid-cols-4 gap-1 rounded-md border border-border/70 bg-card p-1">
            {POSITIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                title={t(label)}
                aria-label={t(label)}
                onClick={() => {
                  update('watermarkX', null)
                  update('watermarkY', null)
                  update('watermarkPosition', value)
                }}
                className={`h-8 rounded-sm px-1 hover:bg-muted ${
                  kit.watermarkX == null &&
                  kit.watermarkY == null &&
                  kit.watermarkPosition === value
                    ? 'bg-primary text-primary-foreground hover:bg-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <Icon />
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
            className="mt-2.5 w-full"
          />
        </div>

        <div className="border-t border-border/70 pt-3 @min-[520px]/watermark:col-span-2">
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
          {!canWhiteLabel && (
            <Link
              href="/dashboard/billing"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
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
