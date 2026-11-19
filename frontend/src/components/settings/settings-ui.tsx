'use client'

import { ChevronRight, LockKeyhole } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import styles from './settings.module.css'
import controls from './settings-controls.module.css'

export function SettingsCard({
  title,
  list = false,
  className = '',
  children,
  ...props
}: { title?: ReactNode; list?: boolean } & ComponentProps<'section'>) {
  return (
    <section className={`${styles.card} ${list ? styles.listCard : ''} ${className}`} {...props}>
      {title && <h2 className={styles.cardTitle}>{title}</h2>}
      {children}
    </section>
  )
}

/** The 40px outlined circle that holds a row icon. */
export function IconCircle({ children, large = false, tone }: { children: ReactNode; large?: boolean; tone?: 'danger' }) {
  return (
    <span className={styles.iconCircle} data-large={large ? '' : undefined} data-tone={tone}>
      {children}
    </span>
  )
}

export function Chevron() {
  return (
    <span className={styles.chevron} aria-hidden="true">
      <ChevronRight />
    </span>
  )
}

export function StatusDot({ tone, children }: { tone: 'ok' | 'muted'; children: ReactNode }) {
  return (
    <span className={controls.status} data-tone={tone}>
      <span aria-hidden="true" />
      {children}
    </span>
  )
}

export function Pill({ tone = 'outline', children }: { tone?: 'outline' | 'warning'; children: ReactNode }) {
  return (
    <span className={controls.pill} data-tone={tone}>
      {children}
    </span>
  )
}

export function Switch({
  checked,
  label,
  locked = false,
  disabled = false,
  busy = false,
  onChange,
  ...props
}: {
  checked: boolean
  label: string
  locked?: boolean
  disabled?: boolean
  busy?: boolean
  onChange?: (checked: boolean) => void
} & Omit<ComponentProps<'button'>, 'onChange'>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      className={`${controls.switch} ${controls.focus}`}
      data-locked={locked ? '' : undefined}
      disabled={locked || disabled}
      onClick={() => onChange?.(!checked)}
      {...props}
    >
      <span aria-hidden="true" />
    </button>
  )
}

export function Segmented<Value extends string>({
  label,
  value,
  options,
  disabled,
  wide = false,
  onChange
}: {
  label: string
  value: Value
  options: readonly { value: Value; label: ReactNode }[]
  disabled?: boolean
  wide?: boolean
  onChange: (value: Value) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className={controls.segmented} data-wide={wide ? '' : undefined}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={controls.focus}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function TextField({ label, ...input }: { label: string } & ComponentProps<'input'>) {
  return (
    <label className={controls.field}>
      <span>{label}</span>
      <span className={controls.fieldBox}>
        <input {...input} />
      </span>
    </label>
  )
}

/** Read-only value with a lock, e.g. the sign-in e-mail. */
export function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div className={controls.field}>
      <span>{label}</span>
      <span className={controls.lockedBox} data-settings-locked-email="">
        <span>{value}</span>
        <LockKeyhole aria-hidden="true" />
      </span>
    </div>
  )
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p className={controls.error} role="alert">
      {message}
    </p>
  )
}

export function Avatar({ name, image, size }: { name: string; image: string | null; size: 56 | 72 | 84 }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.34 }} data-settings-avatar="">
      {image ? <img src={image} alt="" /> : initials || '?'}
    </span>
  )
}
