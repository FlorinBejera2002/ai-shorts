'use client'

import { Check, ChevronDown } from 'lucide-react'
import { Select, Slider, Switch } from 'radix-ui'
import type { ReactNode } from 'react'
import { brandPortal, moveRadio } from './editor-utils'
import styles from './brand-editor.module.css'

type Option<T> = { value: T; label: ReactNode; name?: string }

/** Pill radiogroup (Rânduri, Aliniere, 9:16 / 1:1 / 16:9). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className = ''
}: {
  label: string
  value: T
  options: Array<Option<T>>
  onChange: (value: T) => void
  className?: string
}) {
  const values = options.map((option) => option.value)
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${styles.segmented} ${className}`}
      onKeyDown={(event) => moveRadio(event, values, value, onChange)}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-label={option.name}
          title={option.name}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ToggleSwitch({
  label,
  checked,
  disabled,
  onChange
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Switch.Root
      className={`${styles.switch} ${styles.focus}`}
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onCheckedChange={onChange}
    >
      <Switch.Thumb className={styles.switchThumb} />
    </Switch.Root>
  )
}

/** Label, live value and the canvas slider (6px track, 20px ringed thumb). */
export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <div className={styles.range}>
      <span className={styles.rangeHead}>
        <span className={styles.label}>{label}</span>
        <output>{format(value)}</output>
      </span>
      <Slider.Root
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={[Math.min(max, Math.max(min, value))]}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next)
        }}
      >
        <Slider.Track className={styles.sliderTrack}>
          <Slider.Range className={styles.sliderFill} />
        </Slider.Track>
        <Slider.Thumb className={styles.sliderThumb} aria-label={label} aria-valuetext={format(value)} />
      </Slider.Root>
    </div>
  )
}

/** Labelled select styled as the canvas field (44px, 14px radius) with a reference menu popup. */
export function SelectField({
  id,
  label,
  value,
  options,
  disabled,
  onChange
}: {
  id: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <Select.Root value={value} disabled={disabled} onValueChange={onChange}>
        <Select.Trigger id={id} className={`${styles.control} ${styles.focus}`} aria-label={label}>
          <Select.Value />
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={6}
            collisionPadding={16}
            className={`${brandPortal} ${styles.menu}`}
            data-reference-surface=""
          >
            <Select.Viewport>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} className={styles.option}>
                  <Select.ItemText>{option.label}</Select.ItemText>
                  {option.value === value && <Check aria-hidden="true" />}
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}
