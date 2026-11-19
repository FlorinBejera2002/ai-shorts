'use client'

import type { ActivityDay } from '@/lib/dashboard-activity'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { lastSevenDays } from './home-activity'
import styles from './home.module.css'

const BAR_HEIGHT = 46

interface HomeStatsProps {
  clipCount: number
  jobCount: number
  durationMinutes: number
  activity: ActivityDay[]
}

/** One strip: clips, projects, minutes of video and the last seven days. */
export function HomeStats({ clipCount, jobCount, durationMinutes, activity }: HomeStatsProps) {
  const t = useTranslations('dashboard.home.stats')
  const locale = useLocale()
  const days = lastSevenDays(activity)
  const weekTotal = days.reduce((sum, day) => sum + day.clips, 0)
  const max = Math.max(1, ...days.map((day) => day.clips))
  const { weekday, number } = useMemo(
    () => ({
      weekday: new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }),
      number: new Intl.NumberFormat(locale)
    }),
    [locale]
  )
  const metrics = [
    { id: 'clips', label: t('clips'), value: clipCount },
    { id: 'projects', label: t('projects'), value: jobCount },
    { id: 'minutes', label: t('video'), value: durationMinutes, unit: t('minutes') }
  ]

  return (
    <section className={`${styles.card} ${styles.stats}`} aria-label={t('label')} data-home-stats="">
      <div className={styles.metrics}>
        {metrics.map((metric, index) => (
          <Metric key={metric.id} {...metric} value={number.format(metric.value)} divider={index > 0} />
        ))}
      </div>
      <span className={styles.statDivider} aria-hidden="true" data-desktop-only="" />
      <div className={styles.week}>
        <span className={styles.weekCopy}>
          <span className={styles.metricLabel}>{t('lastSevenDays')}</span>
          <strong>{t('weekClips', { count: weekTotal })}</strong>
        </span>
        <div className={styles.bars} role="img" aria-label={t('chartLabel', { count: weekTotal })}>
          {days.map((day) => (
            <span key={day.date.toISOString()} className={styles.bar} data-today={day.today ? '' : undefined}>
              <span className={styles.barFill} style={{ height: Math.max(4, Math.round((day.clips / max) * BAR_HEIGHT)) }} />
              <span className={styles.barLabel}>{weekday.format(day.date)}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function Metric({ id, label, value, unit, divider }: { id: string; label: string; value: string; unit?: string; divider: boolean }) {
  return (
    <>
      {divider && <span className={styles.statDivider} aria-hidden="true" />}
      <span className={styles.metric} data-home-stat={id}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricValue}>
          <strong>{value}</strong>
          {unit && <span>{unit}</span>}
        </span>
      </span>
    </>
  )
}
