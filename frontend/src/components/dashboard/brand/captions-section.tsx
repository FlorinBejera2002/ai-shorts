'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Slider } from '@/components/ui/slider'
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Captions
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ColorField } from './color-field'
import { SUBTITLE_FONTS } from './constants'
import { SectionHeading } from './section-heading'
import type { BrandKit, BrandKitUpdate } from './types'
import { contrastRatio } from './utils'

const POSITIONS = [
  { value: 'top', icon: AlignVerticalJustifyStart },
  { value: 'center', icon: AlignVerticalJustifyCenter },
  { value: 'bottom', icon: AlignVerticalJustifyEnd }
]

export function CaptionsSection({
  kit,
  update
}: {
  kit: BrandKit
  update: BrandKitUpdate
}) {
  const t = useTranslations('brand')
  const ratio = contrastRatio(kit.subtitleColor, kit.subtitleBgColor)
  const readable = ratio >= 4.5

  return (
    <Card id="brand-captions" as="section" className="brand-section p-5 sm:p-6">
      <SectionHeading
        icon={Captions}
        eyebrow={t('videoEyebrow')}
        title={t('subtitleStyle')}
        description={t('subtitleDesc')}
        action={
          <span
            className={`brand-contrast-badge shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              readable ? 'is-readable' : 'is-low'
            }`}
          >
            {ratio.toFixed(1)}:1 · {readable ? t('aaPass') : t('lowContrast')}
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground" htmlFor="sub-font">
              {t('subtitleFont')}
            </Label>
            <NativeSelect
              id="sub-font"
              value={kit.subtitleFont}
              onChange={(event) => update('subtitleFont', event.target.value)}
              className="mt-1.5 w-full rounded-lg"
            >
              {SUBTITLE_FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <ColorField
              id="subtitle-color"
              label={t('textColor')}
              value={kit.subtitleColor}
              onChange={(value) => update('subtitleColor', value)}
            />
            <ColorField
              id="subtitle-background"
              label={t('background')}
              value={kit.subtitleBgColor}
              onChange={(value) => update('subtitleBgColor', value)}
            />
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {t('bgOpacity')}
              </Label>
              <span className="text-xs tabular-nums">
                {Math.round(kit.subtitleBgOpacity * 100)}%
              </span>
            </div>
            <Slider
              aria-label={t('bgOpacity')}
              min={0}
              max={100}
              value={[Math.round(kit.subtitleBgOpacity * 100)]}
              onValueChange={([value = 70]) =>
                update('subtitleBgOpacity', value / 100)
              }
              className="mt-3 w-full"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              {t('position')}
            </Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {POSITIONS.map(({ value, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={
                    kit.subtitlePosition === value ? 'default' : 'outline'
                  }
                  onClick={() => update('subtitlePosition', value)}
                  className="h-14 flex-col rounded-lg text-xs"
                >
                  <Icon />
                  {t(value as 'top' | 'center' | 'bottom')}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
