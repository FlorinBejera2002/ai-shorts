'use client'

import { useAuth } from '@/components/auth/use-auth'
import { Link } from '@/i18n/navigation'
import { FileText, LayoutGrid, Youtube } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { HomeCreateBar } from './home-create-bar'
import styles from './home.module.css'

const SHORTCUTS = [
  { key: 'writeScript', href: '/dashboard/script-generator', icon: FileText },
  { key: 'youtubeAccount', href: '/dashboard/create?mode=youtube&source=library', icon: Youtube },
  { key: 'myClips', href: '/dashboard/clips', icon: LayoutGrid }
] as const

/** "Ce creăm azi?" card. `firstRun` shows the larger new-account version with the illustration. */
export function HomeHero({ firstRun = false }: { firstRun?: boolean }) {
  const t = useTranslations('dashboard.home')
  const { user } = useAuth()
  const firstName = user?.name?.trim().split(/\s+/)[0]

  return (
    <section
      className={`${styles.card} ${styles.hero} ${firstRun ? styles.heroFirst : ''}`}
      aria-labelledby="home-hero-title"
      data-home-hero={firstRun ? 'first-run' : 'default'}
      data-home-refresh-anchor=""
    >
      <div className={styles.heroCopy}>
        <div className={styles.greeting}>
          <span>{firstName ? t('greeting', { name: firstName }) : t('greetingFallback')}</span>
          <h1 id="home-hero-title">{t(firstRun ? 'firstTitle' : 'title')}</h1>
        </div>
        <HomeCreateBar />
        {!firstRun && (
          <nav className={styles.shortcuts} aria-label={t('shortcutsLabel')}>
            {SHORTCUTS.map(({ key, href, icon: Icon }) => (
              <Link
                key={key}
                href={href}
                className={`${styles.shortcut} ${styles.focusable}`}
                data-home-open-library={key === 'myClips' ? '' : undefined}
              >
                <Icon aria-hidden="true" />
                {t(`shortcuts.${key}`)}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {firstRun && (
        <img
          className={styles.heroIllustration}
          src="/illustrations/library-empty.webp"
          alt={t('firstIllustrationAlt')}
          width={250}
          height={250}
          decoding="async"
        />
      )}
    </section>
  )
}
