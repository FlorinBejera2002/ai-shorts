'use client'

import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import styles from './auth-canvas.module.css'

const SCREEN_ILLUSTRATIONS = {
  login: '/illustrations/auth-login.webp',
  register: '/illustrations/auth-register.webp',
  mfa: '/illustrations/auth-key.webp',
  verify: '/illustrations/auth-email.webp',
  forgot: '/illustrations/auth-key.webp',
  forgotSent: '/illustrations/auth-email.webp',
  reset: '/illustrations/auth-key.webp',
  resetDone: '/illustrations/auth-done.webp',
  resetInvalid: '/illustrations/auth-link-invalid.webp',
  activate: '/illustrations/auth-email.webp',
  activateDone: '/illustrations/auth-done.webp'
} as const

export type AuthScreen = keyof typeof SCREEN_ILLUSTRATIONS

interface AuthCanvasLayoutProps {
  screen: AuthScreen
  compact?: boolean
  children: ReactNode
}

/** Illustration and sticker tagline beside the auth card, with the legal footer under it. */
export function AuthCanvasLayout({
  screen,
  compact = false,
  children
}: AuthCanvasLayoutProps) {
  const t = useTranslations('authCanvas')
  const cardClassName = compact
    ? `${styles.card} ${styles.cardCompact}`
    : styles.card

  return (
    <div className={styles.canvas}>
      <main className={styles.main}>
        <div className={styles.stage}>
          <img
            className={styles.illustration}
            src={SCREEN_ILLUSTRATIONS[screen]}
            alt={t(`screens.${screen}.alt`)}
            width={400}
            height={400}
          />
          <p className={styles.sticker}>
            {t(`screens.${screen}.lead`)}{' '}
            <span className={styles.stickerAccent}>
              {t(`screens.${screen}.accent`)}
            </span>
          </p>
        </div>
        <div className={styles.cardColumn}>
          <section className={cardClassName}>
            <Link href="/" className={styles.logoLink}>
              <img
                className={`${styles.logo} ${styles.logoLight}`}
                src="/brand/sneepcut-wordmark.svg"
                alt="Sneep Cut"
              />
              <img
                className={`${styles.logo} ${styles.logoDark}`}
                src="/brand/sneepcut-wordmark-dark.svg"
                alt="Sneep Cut"
              />
            </Link>
            {children}
          </section>
        </div>
      </main>
      <footer className={styles.footer}>
        {t('footer.copyright', { year: new Date().getFullYear() })} ·{' '}
        <Link href="/terms">{t('footer.terms')}</Link> ·{' '}
        <Link href="/privacy">{t('footer.privacy')}</Link>
      </footer>
    </div>
  )
}
