'use client'

import { Link } from '@/i18n/navigation'
import { ChevronRight, FileText, Upload, Youtube } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useFirstSteps } from './use-home-data'
import styles from './home.module.css'

const START_OPTIONS = [
  { key: 'upload', href: '/dashboard/create?mode=upload', icon: Upload },
  { key: 'youtube', href: '/dashboard/create?mode=youtube', icon: Youtube },
  { key: 'script', href: '/dashboard/script-generator', icon: FileText }
] as const

/** "Cum vrei să începi?": the three ways to start a first clip. */
function StartOptions() {
  const t = useTranslations('dashboard.home.start')
  return (
    <section className={`${styles.card} ${styles.startList}`} aria-labelledby="home-start-title">
      <h2 id="home-start-title" className={styles.sectionTitle}>{t('title')}</h2>
      <ul className={styles.startOptions}>
        {START_OPTIONS.map(({ key, href, icon: Icon }) => (
          <li key={key}>
            <Link href={href} className={`${styles.startOption} ${styles.focusable}`} data-home-start={key}>
              <span className={styles.startIcon}><Icon aria-hidden="true" /></span>
              <span className={styles.optionCopy}>
                <strong>{t(`${key}.title`)}</strong>
                <span className={styles.muted}>{t(`${key}.description`)}</span>
              </span>
              <ChevronRight className={styles.chevron} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "Primii pași": four tasks, ticked from real account data. */
function FirstSteps({ hasClips }: { hasClips: boolean }) {
  const t = useTranslations('dashboard.home.steps')
  const { data } = useFirstSteps(true)
  const steps = [
    { key: 'clip', href: '/dashboard/create', done: hasClips },
    { key: 'brand', href: '/dashboard/brand', done: Boolean(data?.brandKit) },
    { key: 'networks', href: '/dashboard/publish', done: Boolean(data?.networks) },
    { key: 'schedule', href: '/dashboard/publish/new', done: Boolean(data?.scheduled) }
  ]
  const done = steps.filter((step) => step.done).length
  const current = steps.findIndex((step) => !step.done)
  return (
    <section className={`${styles.card} ${styles.firstSteps}`} aria-labelledby="home-steps-title" data-home-first-steps="">
      <div className={styles.cardHead}>
        <h2 id="home-steps-title" className={styles.sectionTitle}>{t('title')}</h2>
        <span className={styles.muted}>{t('progress', { done, total: steps.length })}</span>
      </div>
      <span
        className={styles.stepsTrack}
        role="progressbar"
        aria-label={t('progress', { done, total: steps.length })}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
      >
        <span className={styles.progressFill} style={{ width: `${Math.max(4, (done / steps.length) * 100)}%` }} />
      </span>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className={`${styles.step} ${styles.focusable}`}
              data-done={step.done ? '' : undefined}
              data-current={index === current ? '' : undefined}
            >
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <span className={styles.stepLabel}>
                {t(step.key)}
                {step.done && <span className="sr-only"> · {t('done')}</span>}
              </span>
              <ChevronRight className={styles.chevron} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** New account: ways to start next to the first-steps checklist. */
export function HomeFirstRun({ hasClips = false }: { hasClips?: boolean }) {
  return (
    <div className={styles.row} data-home-empty="">
      <StartOptions />
      <FirstSteps hasClips={hasClips} />
    </div>
  )
}
