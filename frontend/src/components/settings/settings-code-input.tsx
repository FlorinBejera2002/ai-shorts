'use client'

import { useTranslations } from 'next-intl'
import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import controls from './settings-controls.module.css'

const LENGTH = 6

/** Six single-digit boxes (3 + 3) bound to one code string; typing or pasting fills forward. */
export function SettingsCodeInput({
  value,
  label,
  disabled,
  onChange
}: {
  value: string
  label: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const t = useTranslations('settings.page')
  const labelId = useId()
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.replace(/\D/g, '').slice(0, LENGTH)

  function write(index: number, typed: string) {
    const incoming = typed.replace(/\D/g, '')
    if (!incoming) return
    const next = (digits.slice(0, index) + incoming + digits.slice(index + incoming.length)).slice(0, LENGTH)
    onChange(next)
    inputs.current[Math.min(index + incoming.length, LENGTH - 1)]?.focus()
  }

  function keyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Backspace') return
    event.preventDefault()
    const target = digits[index] ? index : index - 1
    if (target < 0) return
    onChange(digits.slice(0, target) + digits.slice(target + 1))
    inputs.current[target]?.focus()
  }

  function paste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    write(index, event.clipboardData.getData('text'))
  }

  const box = (index: number) => (
    <input
      key={index}
      ref={(element) => {
        inputs.current[index] = element
      }}
      aria-label={t('digit', { index: index + 1 })}
      inputMode="numeric"
      autoComplete={index === 0 ? 'one-time-code' : 'off'}
      maxLength={index === 0 ? LENGTH : 1}
      value={digits[index] ?? ''}
      disabled={disabled || index > digits.length}
      onChange={(event) => write(index, event.target.value)}
      onKeyDown={(event) => keyDown(index, event)}
      onPaste={(event) => paste(index, event)}
      onFocus={(event) => event.target.select()}
      data-settings-digit={index}
    />
  )

  return (
    <div className={controls.field}>
      <span id={labelId}>{label}</span>
      <div className={controls.digits} role="group" aria-labelledby={labelId}>
        {[0, 1, 2].map(box)}
        <span aria-hidden="true" />
        {[3, 4, 5].map(box)}
      </div>
    </div>
  )
}
