import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/switch'
import { captionEffects, type CaptionStyle } from './caption-style'
import { ColorField } from './color-field'
import styles from './caption-editor.module.css'

export function CaptionColorSettings({ value, onChange }: {
  value: CaptionStyle
  onChange: (value: CaptionStyle) => void
}) {
  const t = useTranslations('brand')
  const [activeColor, setActiveColor] = useState<string | null>(null)
  const effects = captionEffects(value, 720, value.size * 720)
  const update = <Key extends keyof CaptionStyle>(key: Key, next: CaptionStyle[Key]) => onChange({ ...value, [key]: next })
  return (
    <div className={styles.colorSettings}>
      <div className={styles.colorGrid}>
        {([
          ['caption-text', 'textColor', 'text_color'],
          ['caption-outline', 'outlineColor', 'outline_color'],
          ['caption-background', 'background', 'background_color'],
          ['caption-highlight', 'highlightColor', 'highlight_color']
        ] as const).map(([id, label, key]) => (
          <ColorField key={id} id={id} label={t(label)} value={value[key]} onChange={next => update(key, next)}
            open={activeColor === id} onOpenChange={open => setActiveColor(current => open ? id : current === id ? null : current)} />
        ))}
      </div>
      <div className={styles.effectRows}>
        {([
          ['outline_enabled', 'captionOutline', effects.outline > 0],
          ['background_enabled', 'background', effects.backgroundOpacity > 0],
          ['active_word_enabled', 'highlightColor', effects.activeWord]
        ] as const).map(([key, label, enabled]) => (
          <label key={key} className={styles.effectRow}>
            <span>{t(label)}</span>
            <Switch checked={enabled} aria-label={t(label)} onCheckedChange={checked => update(key, checked)} />
          </label>
        ))}
        <label className={styles.effectRow}>
          <span>{t('editorDesign.animation')}</span>
          <select aria-label={t('captionAnimation')} value={effects.animation} className={styles.nativeSelect}
            onChange={event => update('animation', event.target.value as NonNullable<CaptionStyle['animation']>)}>
            {(['none', 'phrase-pop', 'subtle-fade', 'word-pop', 'word-fade'] as const).map(choice => (
              <option key={choice} value={choice}>{t(`animation_${choice}`)}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
