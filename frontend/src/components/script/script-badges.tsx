'use client'

import { cn } from '@/lib/utils'
import { scriptPlatform } from './script-options'
import styles from './scripts-workspace.module.css'

export function ScriptPlatformBadge({
  platform,
  className,
  fallbackLabel,
  decorative = false
}: {
  platform: string
  className?: string
  /** Hide from assistive technology when a parent already names it. */
  decorative?: boolean
  /** Accessible name used when the stored platform is no longer supported. */
  fallbackLabel?: string
}) {
  const option = scriptPlatform(platform)
  return (
    <span
      className={cn(styles.platformBadge, className)}
      data-script-platform={option?.value ?? 'unknown'}
      title={decorative ? undefined : (option?.label ?? fallbackLabel)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : (option?.label ?? fallbackLabel)}
      aria-hidden={decorative || undefined}
    >
      <span aria-hidden="true">{option?.short ?? '?'}</span>
    </span>
  )
}

export function ScriptStatusPill({
  status,
  label,
  className
}: {
  status: string
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(styles.statusPill, className)}
      data-script-status={status}
    >
      {label}
    </span>
  )
}
