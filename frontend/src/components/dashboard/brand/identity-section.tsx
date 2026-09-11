'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { ArrowLeftRight, Check, Palette, Type } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ColorField } from './color-field'
import { BRAND_FONTS, BRAND_PALETTES } from './constants'
import { SectionHeading } from './section-heading'
import type { BrandKit, BrandKitUpdate } from './types'
import { sameColor } from './utils'

export function IdentitySection({
  kit,
  update
}: {
  kit: BrandKit
  update: BrandKitUpdate
}) {
  const t = useTranslations('brand')

  function swapColors() {
    const primary = kit.primaryColor
    update('primaryColor', kit.secondaryColor)
    update('secondaryColor', primary)
  }

  return (
    <Card id="brand-identity" as="section" className="brand-section p-5 sm:p-6">
      <SectionHeading
        icon={Palette}
        eyebrow={t('identityEyebrow')}
        title={t('visualSystem')}
        description={t('visualSystemDesc')}
        action={
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={swapColors}
            title={t('swap')}
            className="rounded-lg text-xs text-muted-foreground"
          >
            <ArrowLeftRight />
            <span className="hidden sm:inline">{t('swap')}</span>
          </Button>
        }
      />

      <div>
        <Label className="text-xs text-muted-foreground">
          {t('palettePresets')}
        </Label>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
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
                className="brand-palette relative h-11 rounded-lg border border-border/80 p-1 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-full overflow-hidden rounded-md">
                  <span
                    className="h-full flex-1"
                    style={{ backgroundColor: palette.primary }}
                  />
                  <span
                    className="h-full flex-1"
                    style={{ backgroundColor: palette.secondary }}
                  />
                </span>
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-5 items-center justify-center rounded-full bg-white text-black shadow-md">
                      <Check className="size-3" />
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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

      <div className="brand-type-row grid gap-4 rounded-xl border border-border/80 bg-muted/20 p-4 md:grid-cols-[1fr_1.1fr] md:items-center">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-foreground text-background">
            <Type className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{t('brandTypeface')}</p>
            <p className="text-xs text-muted-foreground">{t('typefaceRole')}</p>
          </div>
        </div>
        <div>
          <Label className="sr-only" htmlFor="font-family">
            {t('fontFamily')}
          </Label>
          <NativeSelect
            id="font-family"
            value={kit.fontFamily}
            onChange={(event) => update('fontFamily', event.target.value)}
            className="w-full rounded-lg"
            style={{ fontFamily: kit.fontFamily }}
          >
            {BRAND_FONTS.map((font) => (
              <option key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </Card>
  )
}
