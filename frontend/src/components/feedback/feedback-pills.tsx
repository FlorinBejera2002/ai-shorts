'use client'

import { ToggleGroup } from 'radix-ui'
import type { ReactNode } from 'react'
import styles from './feedback.module.css'

/** Single-choice pill row (kind, category, clip rating); `variant` picks the segment or chip look. */
export function FeedbackPills<T extends string>({
  label,
  value,
  options,
  onChange,
  variant = 'chips'
}: {
  label: string
  value: T | ''
  options: readonly { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  variant?: 'segment' | 'chips'
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T)
      }}
      aria-label={label}
      className={variant === 'segment' ? styles.segment : styles.chips}
    >
      {options.map((option) => (
        <ToggleGroup.Item key={option.value} value={option.value} className={styles.pill}>
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
