'use client'

import { Link } from '@/i18n/navigation'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './auth-canvas.module.css'

interface CanvasButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: 'primary' | 'secondary'
  type?: 'button' | 'submit'
  /** Renders a navigation link styled as the same pill button. */
  href?: string
  children: ReactNode
}

export function CanvasButton({
  variant = 'primary',
  type = 'button',
  href,
  children,
  ...buttonProps
}: CanvasButtonProps) {
  const className = `${styles.button} ${styles[variant]}`
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <button type={type} className={className} {...buttonProps}>
      {children}
    </button>
  )
}
