'use client'

import '@/components/clips/media-workbench.css'

import { ApiState } from '@/components/shared/api-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import type { HistoryJob } from '@/types/api'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  XCircle
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

export default function HistoryPage() {
  const locale = useLocale()
  const t = useTranslations('history')
  const studio = useTranslations('dashboard.studio')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const { data, error, reload } = useApiResource<{ jobs: HistoryJob[] }>(
    '/api/dashboard/history'
  )
  if (!data) return <ApiState error={error} retry={reload} />
  const { jobs } = data
  const visibleJobs = jobs.filter(
    (job) =>
      (statusFilter === 'all' || job.status === statusFilter) &&
      `${job.sourceUrl ?? ''} ${job.sourceFilePath ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )

  return (
    <div className="media-workbench space-y-6">
      <PageHeader
        title={t('title')}
        description={t('count', { count: jobs.length })}
        actions={
          <Button asChild={true}>
            <Link href="/dashboard/create">{t('firstProject')}</Link>
          </Button>
        }
      />
      <div className="media-metrics">
        {[
          { label: studio('projects'), value: jobs.length },
          {
            label: studio('completed'),
            value: jobs.filter((job) => job.status === 'completed').length
          },
          {
            label: studio('failed'),
            value: jobs.filter((job) => job.status === 'failed').length
          }
        ].map((metric) => (
          <Card key={metric.label} className="gap-0 py-0 shadow-none">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums">
                {metric.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {jobs.length > 0 && (
        <div className="media-controls">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={locale === 'ro' ? 'Caută proiecte' : 'Search projects'}
            placeholder={
              locale === 'ro'
                ? 'Caută după sursă sau fișier…'
                : 'Search by source or filename…'
            }
          />
          {(
            [
              ['all', studio('projects')],
              ['completed', studio('completed')],
              ['failed', studio('failed')]
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={statusFilter === value ? 'secondary' : 'ghost'}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      {jobs.length ? (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <div className="media-ledger-heading">
            <span>{studio('projects')}</span>
            <span aria-live="polite">
              {visibleJobs.length} / {jobs.length}
            </span>
          </div>
          <div className="divide-y">
            {visibleJobs.map((job, index) => (
              <Link
                key={job.id}
                href={
                  job.status === 'completed'
                    ? '/dashboard/clips'
                    : `/dashboard/jobs/${job.id}`
                }
                className="group flex flex-col gap-4 p-5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="media-project-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <StatusIcon status={job.status} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {job.sourceUrl ??
                        job.sourceFilePath ??
                        (locale === 'ro'
                          ? 'Fișier încărcat'
                          : 'Uploaded source')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {job.numClipsRequested} {t('requested')}
                      </span>
                      <span>
                        {job._count.clips} {t('generated')}
                      </span>
                      <span>{job.aspectRatio}</span>
                      <time dateTime={job.createdAt}>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium'
                        }).format(new Date(job.createdAt))}
                      </time>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <Badge
                    variant="secondary"
                    className={getStatusBadgeClass(job.status)}
                  >
                    {job.status}
                  </Badge>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
            {visibleJobs.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {locale === 'ro'
                  ? 'Niciun proiect pentru această selecție.'
                  : 'No projects match this selection.'}
              </p>
            )}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Clock}
          title={t('noJobs')}
          description={
            locale === 'ro'
              ? 'Creează primul proiect pentru a-l vedea aici.'
              : 'Create your first project to see it here.'
          }
          action={
            <Button asChild={true}>
              <Link href="/dashboard/create">{t('firstProject')}</Link>
            </Button>
          }
        />
      )}
    </div>
  )
}

function getStatusBadgeClass(status: string) {
  const base =
    'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]'

  if (status === 'completed') return `${base} bg-success/10 text-success`
  if (status === 'failed') return `${base} bg-destructive/10 text-destructive`
  if (status === 'cancelled') return `${base} bg-muted text-muted-foreground`
  return `${base} bg-warning/10 text-warning`
}

function StatusIcon({ status }: { status: string }) {
  const config = {
    completed: {
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-success/10'
    },
    failed: {
      icon: XCircle,
      color: 'text-destructive',
      bg: 'bg-destructive/10'
    },
    cancelled: {
      icon: AlertCircle,
      color: 'text-muted-foreground',
      bg: 'bg-muted'
    },
    default: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' }
  }

  const {
    icon: Icon,
    color,
    bg
  } = config[status as keyof typeof config] || config.default

  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}
    >
      <Icon className={`h-5 w-5 ${color}`} strokeWidth={1.75} />
    </div>
  )
}
