'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ArrowLeftRight, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ColorField } from './color-field'
import { BRAND_PALETTES } from './constants'
import type { BrandKit, BrandKitUpdate } from './types'
import { sameColor } from './utils'

export function ColorsSection({
  kit,
  update
}: {
  kit: BrandKit
  update: BrandKitUpdate
}) {
  const t = useTranslations('brand')
  const enabled = kit.applyBrandColors

  function swapColors() {
    const primary = kit.primaryColor
    update('primaryColor', kit.secondaryColor)
    update('secondaryColor', primary)
  }

  return (
    <Card
      as="section"
      id="brand-colors"
      className="brand-section @container/colors min-w-0 gap-2.5 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{t('colors')}</h2>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="brand-colors-enabled"
            className="text-[11px] text-muted-foreground"
          >
            {t('applyColors')}
          </Label>
          <Switch
            id="brand-colors-enabled"
            checked={enabled}
            onCheckedChange={(checked) => update('applyBrandColors', checked)}
          />
          {enabled && (
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={swapColors}
              title={t('swap')}
              aria-label={t('swap')}
              className="rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeftRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div>
        <div className="grid grid-cols-2 gap-2 @min-[420px]/colors:grid-cols-4">
          {BRAND_PALETTES.map((palette) => {
            const active =
              sameColor(kit.primaryColor, palette.primary) &&
              sameColor(kit.secondaryColor, palette.secondary)
            return (
              <button
                key={palette.name}
                type="button"
                title={palette.name}
                aria-label={`${t('usePalette')} ${palette.name}`}
                aria-pressed={active}
                onClick={() => {
                  update('primaryColor', palette.primary)
                  update('secondaryColor', palette.secondary)
                }}
                className={`brand-palette flex h-10 items-center gap-2 rounded-md border px-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background'
                }`}
              >
                <span className="flex h-6 w-11 shrink-0 overflow-hidden rounded-sm">
                  <span
                    className="h-full flex-1"
                    style={{ backgroundColor: palette.primary }}
                  />
                  <span
                    className="h-full flex-1"
                    style={{ backgroundColor: palette.secondary }}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {palette.name}
                </span>
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {active && <Check className="size-3.5 text-primary" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-2 @min-[460px]/colors:grid-cols-2">
        <ColorField
          id="primary-color"
          label={t('primary')}
          value={kit.primaryColor}
          onChange={(value) => update('primaryColor', value)}
        />
        <ColorField
          id="secondary-color"
          label={t('secondary')}
          value={kit.secondaryColor}
          onChange={(value) => update('secondaryColor', value)}
        />
      </div>
    </Card>
  )
}
