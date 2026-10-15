import { useTranslations } from 'next-intl'
import { Slider } from '@/components/ui/slider'
import type { CaptionStyle } from './caption-style'

const controls = [
  ['letter_spacing', 'captionLetterSpacing', -0.05, 0.3, 0.01, 0],
  ['word_spacing', 'captionWordSpacing', 0, 1, 0.01, 0],
  ['line_spacing', 'captionSpacing', 1, 1.8, 0.05, 1.15]
] as const

export function CaptionSpacingControls({ value, onChange }: {
  value: CaptionStyle
  onChange: (value: CaptionStyle) => void
}) {
  const t = useTranslations('brand')
  return (
    <div className="grid gap-4 rounded-md border p-3">
      {controls.map(([key, label, min, max, step, fallback]) => (
        <div key={key} className="grid gap-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>{t(label)}</span>
            <output className="tabular-nums text-muted-foreground">
              {(value[key] ?? fallback).toFixed(2)}{key === 'line_spacing' ? '×' : 'em'}
            </output>
          </div>
          <Slider
            aria-label={t(label)}
            min={min}
            max={max}
            step={step}
            value={[value[key] ?? fallback]}
            onValueChange={([next]) => {
              if (next !== undefined) onChange({ ...value, [key]: next })
            }}
          />
        </div>
      ))}
    </div>
  )
}
