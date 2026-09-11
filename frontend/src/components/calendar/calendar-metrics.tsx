'use client'

import { Card } from '@/components/ui/card'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import { CalendarDays, CheckCircle2, Clock3, FileClock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './calendar-workspace.module.css'

export function CalendarMetrics({
  posts,
  month
}: {
  posts: ScheduledPostRecord[]
  month: Date
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
      className: 'bg-primary/10 text-primary'
    },
    {
      label: t('metrics.scheduled'),
      value: monthPosts.filter((post) => post.status === 'scheduled').length,
      icon: Clock3,
      className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
    },
    {
      label: t('metrics.published'),
      value: monthPosts.filter((post) => post.status === 'published').length,
      icon: CheckCircle2,
      className: 'bg-success/10 text-success'
    },
    {
      label: t('metrics.drafts'),
      value: monthPosts.filter((post) => post.status === 'draft').length,
      icon: FileClock,
      className: 'bg-muted text-muted-foreground'
    }
  ]

  return (
    <section aria-label={t('metrics.label')} className={styles.metrics}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Card key={item.label} className={styles.metric}>
            <span className={`${styles.metricIcon} ${item.className}`}>
              <Icon className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="section-label truncate">{item.label}</p>
              <p className="mt-1.5 text-xl font-semibold tabular-nums leading-none">
                {item.value}
              </p>
            </div>
          </Card>
        )
      })}
    </section>
  )
}
