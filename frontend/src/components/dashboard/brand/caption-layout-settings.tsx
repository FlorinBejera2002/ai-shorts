import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { CaptionStyle } from './caption-style'
import styles from './caption-editor.module.css'

export function CaptionLayoutSettings({ value, onChange }: {
  value: CaptionStyle
  onChange: (value: CaptionStyle) => void
}) {
  const t = useTranslations('brand')
  const update = <Key extends keyof CaptionStyle>(key: Key, next: CaptionStyle[Key]) => onChange({ ...value, [key]: next })
  return (
    <div className={styles.layoutSettings}>
      <div className={styles.twoColumns}>
        <NumberField label={t('editorDesign.textSize')} value={Number((value.size * 100).toFixed(2))} min={2} max={16} step={0.5} onChange={next => update('size', next / 100)} />
        <NumberField label={t('captionLines')} value={value.max_lines} min={1} max={3} step={1} onChange={next => update('max_lines', next)} />
      </div>
      <div className={styles.rangeField}>
        <div><span>{t('editorDesign.textWidth')}</span><output>{Math.round(value.max_width * 100)}%</output></div>
        <Slider aria-label={t('captionWidth')} min={20} max={96} step={1} value={[value.max_width * 100]}
          onValueChange={([next]) => { if (next !== undefined) update('max_width', next / 100) }} />
      </div>
      <div className={styles.alignmentRow}>
        <span>{t('captionAlign')}</span>
        <div role="group" aria-label={t('captionAlign')} className={styles.alignmentGroup}>
          {([
            ['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]
          ] as const).map(([alignment, Icon]) => (
            <button key={alignment} type="button" aria-label={t(`align_${alignment}`)}
              aria-pressed={value.align === alignment} onClick={() => update('align', alignment)}><Icon className="size-4" /></button>
          ))}
        </div>
      </div>
      <div className={styles.twoColumns}>
        <NumberField label={t('captionOutline')} value={value.outline} min={0} max={8} step={0.5} onChange={next => update('outline', next)} />
        <NumberField label={t('captionShadow')} value={value.shadow} min={0} max={8} step={0.5} onChange={next => update('shadow', next)} />
      </div>
      <div className={styles.rangeField}>
        <div><span>{t('bgOpacity')}</span><output>{Math.round(value.background_opacity * 100)}%</output></div>
        <Slider aria-label={t('bgOpacity')} min={0} max={100} step={5} value={[value.background_opacity * 100]}
          onValueChange={([next]) => { if (next !== undefined) update('background_opacity', next / 100) }} />
      </div>
      <fieldset className={styles.positionFields}>
        <legend>{t('position')}</legend>
        <div className={styles.positionRow}>
          {(['x', 'y'] as const).map(axis => (
            <NumberField key={axis} label={t(axis === 'x' ? 'captionX' : 'captionY')}
              value={Math.round(value.position[axis] * 100)} min={0} max={100} step={1}
              onChange={next => update('position', { ...value.position, [axis]: next / 100 })} />
          ))}
          <Button type="button" variant="outline" onClick={() => update('position', { x: 0.5, y: 0.84, anchor: 'center' })}>
            {t('resetPosition')}
          </Button>
        </div>
      </fieldset>
    </div>
  )
}

function NumberField({ label, value, min, max, step, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step} value={value}
        onChange={event => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
        }} />
    </label>
  )
}
