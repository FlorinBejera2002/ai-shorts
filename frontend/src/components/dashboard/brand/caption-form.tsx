'use client'

import { AlignCenter, AlignLeft, AlignRight, Move, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CaptionFontField } from './caption-font-field'
import { captionEffects, DEFAULT_CAPTION_STYLE, type CaptionStyle } from './caption-style'
import { RangeField, Segmented, SelectField, ToggleSwitch } from './editor-controls'
import { fontWeightFor } from './editor-utils'
import { HexColorField } from './hex-color-field'
import { useCaptionFontLibrary } from './use-caption-font-library'
import editor from './brand-editor.module.css'
import styles from './caption-card.module.css'

const ANIMATIONS = ['none', 'phrase-pop', 'subtle-fade', 'word-pop', 'word-fade'] as const
const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const

/** Font, Grosime, colours, size, lines, position, alignment, animation and effects (canvas Br-Main). */
export function CaptionForm({
  value,
  onChange,
  onBusyChange
}: {
  value: CaptionStyle
  onChange: (value: CaptionStyle) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const t = useTranslations('brand')
  const library = useCaptionFontLibrary({ value, onChange, onBusyChange })
  const font = library.fonts.find((item) => item.id === value.font_id)
  const effects = captionEffects(value, 720, value.size * 720)
  const update = <Key extends keyof CaptionStyle>(key: Key, next: CaptionStyle[Key]) => onChange({ ...value, [key]: next })
  const weights = font?.weights ?? [value.weight]
  const weightName = (weight: number) => (weight % 100 === 0 ? t(`fontWeight_${weight}` as 'fontWeight_700') : (font?.style ?? String(weight)))

  return (
    <div className={styles.form}>
      <CaptionFontField className={styles.font} value={value} library={library} onChange={onChange} />
      <div className={styles.weight}>
        <SelectField
          id="brand-caption-weight"
          label={t('fontWeight')}
          value={String(fontWeightFor(font, value.weight))}
          disabled={library.busy}
          options={weights.map((weight) => ({ value: String(weight), label: `${weightName(weight)} · ${weight}` }))}
          onChange={(next) => update('weight', Number(next))}
        />
      </div>
      <HexColorField className={styles.textColor} label={t('textColor')} value={value.text_color} onChange={(next) => update('text_color', next)} />
      <HexColorField
        className={styles.activeColor}
        label={t('highlightColor')}
        value={value.highlight_color}
        onChange={(next) => update('highlight_color', next)}
      />
      <div className={styles.size}>
        <RangeField
          label={t('editor.textSize')}
          value={Number((value.size * 100).toFixed(1))}
          min={2}
          max={16}
          step={0.5}
          format={(size) => `${size}%`}
          onChange={(size) => update('size', size / 100)}
        />
      </div>
      <div className={`${editor.field} ${styles.lines}`}>
        <span className={editor.label}>{t('editor.lines')}</span>
        <Segmented
          label={t('editor.lines')}
          value={value.max_lines}
          options={[1, 2, 3].map((lines) => ({ value: lines, label: lines }))}
          onChange={(lines) => update('max_lines', lines)}
        />
      </div>
      <div className={`${editor.field} ${styles.position}`}>
        <span className={editor.label}>{t('position')}</span>
        <span className={styles.positionBox}>
          <Move aria-hidden="true" />
          <span>{t('editor.dragInClip')}</span>
          <button
            type="button"
            className={`${styles.iconButton} ${editor.focus}`}
            aria-label={t('resetPosition')}
            title={t('resetPosition')}
            onClick={() => update('position', DEFAULT_CAPTION_STYLE.position)}
          >
            <RotateCcw aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className={`${editor.field} ${styles.align}`}>
        <span className={editor.label}>{t('captionAlign')}</span>
        <Segmented
          label={t('captionAlign')}
          value={value.align}
          options={(['left', 'center', 'right'] as const).map((align) => {
            const Icon = ALIGN_ICONS[align]
            return { value: align, name: t(`align_${align}`), label: <Icon aria-hidden="true" /> }
          })}
          onChange={(align) => update('align', align)}
        />
      </div>
      <div className={styles.animation}>
        <SelectField
          id="brand-caption-animation"
          label={t('editorDesign.animation')}
          value={effects.animation}
          options={ANIMATIONS.map((animation) => ({ value: animation, label: t(`animation_${animation}`) }))}
          onChange={(animation) => update('animation', animation as NonNullable<CaptionStyle['animation']>)}
        />
      </div>
      <div className={`${editor.field} ${styles.effect}`}>
        <span className={editor.label}>{t('editor.effect')}</span>
        <span className={styles.effects}>
          <label className={editor.toggle}>
            <ToggleSwitch label={t('captionOutline')} checked={effects.outline > 0} onChange={(on) => update('outline_enabled', on)} />
            {t('captionOutline')}
          </label>
          <label className={editor.toggle}>
            <ToggleSwitch
              label={t('background')}
              checked={effects.backgroundOpacity > 0}
              onChange={(on) => update('background_enabled', on)}
            />
            {t('background')}
          </label>
        </span>
      </div>
    </div>
  )
}
