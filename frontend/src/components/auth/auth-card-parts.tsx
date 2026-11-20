'use client'

import { useIsMobile } from '@/hooks/use-mobile'
import { useSwipeBack } from '@/hooks/use-swipe-back'
import { Link, useRouter } from '@/i18n/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ComponentProps, ReactNode } from 'react'
import styles from './auth-canvas.module.css'

export function AuthForm({ children, ...formProps }: ComponentProps<'form'>) {
  return (
    <form className={styles.stack} {...formProps}>
      {children}
    </form>
  )
}

export function AuthHeading({
  title,
  description,
  centered = false
}: {
  title: string
  description?: string
  centered?: boolean
}) {
  return (
    <div className={centered ? styles.headingCentered : styles.headingGroup}>
      <h1 className={styles.heading}>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  )
}

export function AuthDivider({ label }: { label: string }) {
  return <div className={styles.divider}>{label}</div>
}

/** Inline error for a page state or a field that cannot be fixed by a toast; action results use toasts. */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className={`${styles.notice} ${styles.noticeError}`}>
      <AlertCircle aria-hidden="true" className={styles.noticeIcon} />
      <span>{children}</span>
    </div>
  )
}

/** Footer line that links to the other account page. */
export function AuthAccountPrompt({
  kind
}: {
  kind: 'noAccount' | 'hasAccount'
}) {
  const t = useTranslations('auth')
  const isNoAccount = kind === 'noAccount'
  return (
    <p className={styles.accountPrompt}>
      {t(kind)}
      <Link
        href={isNoAccount ? '/register' : '/login'}
        className={styles.accountLink}
      >
        {t(isNoAccount ? 'createAccount' : 'signIn')}
      </Link>
    </p>
  )
}

export function AuthBackLink({
  label,
  href,
  onClick
}: {
  label: string
  href?: string
  onClick?: () => void
}) {
  const router = useRouter()
  useSwipeBack(() => (href ? router.push(href) : onClick?.()), useIsMobile())
  const content = (
    <>
      <ArrowLeft aria-hidden="true" width={16} height={16} />
      {label}
    </>
  )
  if (href) {
    return (
      <Link href={href} className={styles.backLink}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" className={styles.backLink} onClick={onClick}>
      {content}
    </button>
  )
}
