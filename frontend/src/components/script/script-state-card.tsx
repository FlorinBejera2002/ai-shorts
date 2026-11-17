'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import styles from './script-state-card.module.css'

type ScriptStateCardProps = {
  title: string
  icon?: ReactNode
  /** Icon circle color: blue info, red danger or a neutral inset. */
  tone?: 'info' | 'danger' | 'neutral'
  dashed?: boolean
  busy?: boolean
  role?: 'alert' | 'status'
  className?: string
  children?: ReactNode
}

/** Centered empty, error and progress card shared by the library and editor. */
export function ScriptStateCard({
  title,
  icon,
  tone = 'info',
  dashed = false,
  busy = false,
  role,
  className,
  children
}: ScriptStateCardProps) {
  return (
    <section
      className={cn(styles.state, className)}
      data-dashed={dashed}
      data-tone={tone}
      role={role}
      aria-busy={busy || undefined}
      aria-label={title}
    >
      {busy ? (
        <span className={styles.progress} aria-hidden="true" />
      ) : (
        icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )
      )}
      <h2 className={styles.title}>{title}</h2>
      {children}
    </section>
  )
}

export function ScriptStateSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )
}
