'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useTranslations } from 'next-intl'

import { BRAND_FONTS } from './constants'

export function BrandFontField({
  value,
  enabled,
  onChange,
  onEnabledChange
}: {
  value: string
  enabled: boolean
  onChange: (font: string) => void
  onEnabledChange: (enabled: boolean) => void
}) {
  const t = useTranslations('brand')

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="font-family" className="text-xs font-semibold">
          {t('brandTypeface')}
        </Label>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="brand-font-enabled"
            className="text-[11px] font-normal text-muted-foreground"
          >
            {t('applyFont')}
          </Label>
          <Switch
            id="brand-font-enabled"
            checked={enabled}
            onCheckedChange={onEnabledChange}
          />
        </div>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id="font-family"
          className="w-full rounded-md border-border bg-card shadow-none data-[size=default]:h-10 dark:bg-card dark:hover:bg-card"
          style={{ fontFamily: value }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {BRAND_FONTS.map((font) => (
            <SelectItem key={font} value={font} style={{ fontFamily: font }}>
              {font}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
