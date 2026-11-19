'use client'

import type { ComponentProps, ReactNode } from 'react'
import styles from './auth-canvas.module.css'

interface CanvasFieldProps extends ComponentProps<'input'> {
  id: string
  label: string
  /** Shown on the label row, for example a forgot-password link. */
  labelAction?: ReactNode
  /** Rendered inside the input frame, for example a visibility toggle. */
  trailing?: ReactNode
}

export function CanvasField({
  id,
  label,
  labelAction,
  trailing,
  ...inputProps
}: CanvasFieldProps) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.fieldLabel}>
          {label}
        </label>
        {labelAction}
      </div>
      <div className={styles.control}>
        <input id={id} className={styles.input} {...inputProps} />
        {trailing}
      </div>
    </div>
  )
}
