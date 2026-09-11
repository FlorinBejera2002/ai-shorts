'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ColorField } from './color-field'
import { SUBTITLE_FONTS } from './constants'
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
}: { kit: BrandKit; update: BrandKitUpdate }) {
  const t = useTranslations('brand')
  const ratio = contrastRatio(kit.subtitleColor, kit.subtitleBgColor)
  const readable = ratio >= 4.5

  return (
    <Card
      as="section"
      id="brand-captions"
      className="brand-section @container/captions min-w-0 gap-3 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">
          {t('subtitleStyle')}
        </h2>
        <span
          className={`brand-contrast-badge shrink-0 rounded-sm px-2 py-1 text-[10px] font-semibold ${readable ? 'is-readable' : 'is-low'}`}
        >
          {ratio.toFixed(1)}:1 · {readable ? t('aaPass') : t('lowContrast')}
        </span>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground" htmlFor="sub-font">
          {t('subtitleFont')}
        </Label>
        <Select
          value={kit.subtitleFont}
          onValueChange={(value) => update('subtitleFont', value)}
        >
          <SelectTrigger
            id="sub-font"
            className="mt-1 h-9 w-full rounded-md bg-card"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUBTITLE_FONTS.map((font) => (
              <SelectItem key={font} value={font}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2 @min-[460px]/captions:grid-cols-2">
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

      <div className="grid gap-3 @min-[520px]/captions:grid-cols-2 @min-[520px]/captions:items-center">
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
            className="mt-2.5 w-full"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            {t('position')}
          </Label>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-md border border-border/70 bg-card p-1">
            {POSITIONS.map(({ value, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                onClick={() => update('subtitlePosition', value)}
                className={`h-7 gap-1 rounded-sm px-1.5 text-[10px] hover:bg-muted ${kit.subtitlePosition === value ? 'bg-primary text-primary-foreground hover:bg-primary' : 'text-muted-foreground'}`}
              >
                <Icon />
                {t(value as 'top' | 'center' | 'bottom')}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
