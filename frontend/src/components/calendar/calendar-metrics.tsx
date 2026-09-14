'use client'

import type { ScheduledPostRecord } from '@/lib/content-calendar'
import { CalendarDays, CheckCircle2, Clock3, FileClock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './calendar-workspace.module.css'

export function CalendarMetrics({
  posts,
  month,
  variant = 'page'
}: {
  posts: ScheduledPostRecord[]
  month: Date
  variant?: 'page' | 'header'
}) {
  const t = useTranslations('contentCalendar')
  const monthPosts = posts.filter((post) => {
    const date = new Date(post.scheduledAt)
    return (
      date.getFullYear() === month.getFullYear() &&
      date.getMonth() === month.getMonth()
    )
  })
  const items = [
    {
      label: t('metrics.total'),
      value: monthPosts.length,
      icon: CalendarDays,
      className: 'text-foreground'
    },
    {
      label: t('metrics.scheduled'),
      value: monthPosts.filter((post) => post.status === 'scheduled').length,
      icon: Clock3,
      className: 'text-foreground'
    },
    {
      label: t('metrics.published'),
      value: monthPosts.filter((post) => post.status === 'published').length,
      icon: CheckCircle2,
      className: 'text-foreground'
    },
    {
      label: t('metrics.drafts'),
      value: monthPosts.filter((post) => post.status === 'draft').length,
      icon: FileClock,
      className: 'text-muted-foreground'
    }
  ]

  return (
    <section
      aria-label={t('metrics.label')}
      className={`${styles.metrics} ${variant === 'header' ? styles.headerMetrics : ''}`}
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div key={item.label} className={styles.metric}>
            <span className={`${styles.metricIcon} ${item.className}`}>
              <Icon className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="section-label truncate">{item.label}</p>
              <p className="mt-1.5 text-xl font-semibold tabular-nums leading-none">
                {item.value}
              </p>
            </div>
          </div>
        )
      })}
    </section>
  )
}
