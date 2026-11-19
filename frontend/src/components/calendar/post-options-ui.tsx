'use client'

import type { ReactNode } from 'react'
import styles from './post-platform-options.module.css'

/** Eyebrow-labelled group whose rows share one bordered card, as on the Publish options canvas. */
export function OptionsGroup({
  label,
  children,
  className
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`${styles.group} ${className ?? ''}`}>
      {label && <h3 className={styles.groupLabel}>{label}</h3>}
      <div className={styles.card}>{children}</div>
    </section>
  )
}

/** One row inside an OptionsGroup: label on the left, control or value on the right. */
export function OptionsRow({
  label,
  htmlFor,
  control,
  nested = false
}: {
  label: ReactNode
  htmlFor?: string
  control: ReactNode
  nested?: boolean
}) {
  return (
    <div className={`${styles.row} ${nested ? styles.rowNested : ''}`}>
      <label htmlFor={htmlFor} className={styles.rowLabel}>
        {label}
      </label>
      <div className={styles.rowControl}>{control}</div>
    </div>
  )
}
