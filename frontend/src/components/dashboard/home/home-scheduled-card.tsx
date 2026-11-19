'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Link } from '@/i18n/navigation'
import { ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { useUpcomingPosts } from './use-home-data'
import styles from './home.module.css'

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "Programate": the next two scheduled posts with their network and time. */
export function HomeScheduledCard() {
  const t = useTranslations('dashboard.home.scheduled')
  const locale = useLocale()
  const { data, isPending, isError } = useUpcomingPosts()
  const { time, date } = useMemo(
    () => ({
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
      date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
    }),
    [locale]
  )

  function when(iso: string) {
    const at = new Date(iso)
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const day = sameDay(at, now) ? t('today') : sameDay(at, tomorrow) ? t('tomorrow') : date.format(at)
    return `${day}, ${time.format(at)}`
  }

  return (
    <section className={`${styles.card} ${styles.scheduled} ${styles.side}`} aria-labelledby="home-scheduled-title" data-home-scheduled="">
      <div className={styles.cardHead}>
        <h2 id="home-scheduled-title" className={styles.sectionTitle}>{t('title')}</h2>
        <Link href="/dashboard/publish" className={styles.inlineLink}>
          {t('calendar')}
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>
      {isPending ? (
        <span className={styles.skeleton} style={{ height: 80 }} aria-hidden="true" />
      ) : isError ? (
        <p className={styles.muted} role="status">{t('loadError')}</p>
      ) : data?.length ? (
        data.map((post) => (
          <Link key={post.id} href={`/dashboard/publish/${post.id}/edit`} className={`${styles.post} ${styles.focusable}`}>
            {post.platforms[0] ? <PlatformBrandIcon provider={post.platforms[0]} className={styles.postLogo} /> : null}
            <span className={styles.postCopy}>
              <strong>{post.title || t('untitled')}</strong>
              <span className={styles.muted}>{when(post.scheduledAt)}</span>
            </span>
          </Link>
        ))
      ) : (
        <p className={styles.muted}>{t('empty')}</p>
      )}
    </section>
  )
}
