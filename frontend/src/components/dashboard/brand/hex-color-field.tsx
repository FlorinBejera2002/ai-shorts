'use client'

import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { CaptionColorPicker } from './caption-color-picker'
import { HEX_RE, normalizeHex } from './utils'
import editor from './brand-editor.module.css'
import styles from './caption-card.module.css'

/** Canvas colour field: swatch (opens the picker), "#" and the six hex digits. */
export function HexColorField({
  label,
  value,
  className,
  onChange
}: {
  label: string
  value: string
  className?: string
  onChange: (value: string) => void
}) {
  const t = useTranslations('brand')
  const id = useId()
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState(false)
  const valid = HEX_RE.test(value)
  const invalid = touched && !valid
  const name = label.toLocaleLowerCase()
  return (
    <div className={`${editor.field} ${className ?? ''}`} data-brand-color-field="">
      <label htmlFor={id} className={editor.label}>
        {label}
      </label>
      <span className={`${editor.control} ${styles.hex}`} data-invalid={invalid ? '' : undefined}>
        <CaptionColorPicker label={label} value={value} onChange={onChange} open={open} onOpenChange={setOpen}>
          <button
            type="button"
            className={`${styles.swatch} ${editor.focus}`}
            aria-label={t('editor.chooseColor', { name })}
            style={{ backgroundColor: valid ? normalizeHex(value) : 'transparent' }}
          />
        </CaptionColorPicker>
        <span className={styles.hash} aria-hidden="true">
          #
        </span>
        <input
          id={id}
          value={value.replace(/^#/, '')}
          maxLength={6}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('editor.hexCode', { name: label })}
          aria-invalid={invalid}
          onChange={(event) => onChange(`#${event.target.value.replace(/[^0-9a-f]/gi, '')}`)}
          onBlur={() => {
            setTouched(true)
            if (valid) onChange(normalizeHex(value))
          }}
        />
      </span>
      {invalid && (
        <p role="alert" className={editor.fieldError}>
          {t('invalidHex')}
        </p>
      )}
    </div>
  )
}
