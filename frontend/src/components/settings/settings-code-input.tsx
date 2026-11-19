'use client'

import { useTranslations } from 'next-intl'
import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import controls from './settings-controls.module.css'

const LENGTH = 6
const FIRST_HALF = [0, 1, 2]
const SECOND_HALF = [3, 4, 5]

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

  const box = (slot: number) => (
    <input
      key={`digit-${slot}`}
      ref={(element) => {
        inputs.current[slot] = element
      }}
      aria-label={t('digit', { index: slot + 1 })}
      inputMode="numeric"
      autoComplete={slot === 0 ? 'one-time-code' : 'off'}
      maxLength={slot === 0 ? LENGTH : 1}
      value={digits[slot] ?? ''}
      disabled={disabled || slot > digits.length}
      onChange={(event) => write(slot, event.target.value)}
      onKeyDown={(event) => keyDown(slot, event)}
      onPaste={(event) => paste(slot, event)}
      onFocus={(event) => event.target.select()}
      data-settings-digit={slot}
    />
  )

  return (
    <div className={controls.field}>
      <span id={labelId}>{label}</span>
      <div className={controls.digits} role="group" aria-labelledby={labelId}>
        {FIRST_HALF.map(box)}
        <span aria-hidden="true" />
        {SECOND_HALF.map(box)}
      </div>
    </div>
  )
}
