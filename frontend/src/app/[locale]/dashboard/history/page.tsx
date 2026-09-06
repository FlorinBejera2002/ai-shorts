import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  XCircle
} from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { auth } from '@/lib/auth'
import { getPrisma } from '@/lib/db'

export const runtime = 'nodejs'

export default async function HistoryPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('history')
  const studio = await getTranslations('dashboard.studio')

  const session = await auth()
  const prisma = getPrisma()
  const jobs = session?.user?.id
    ? await prisma.job.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { _count: { select: { clips: true } } }
      })
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('count', { count: jobs.length })}
        actions={
          <Button asChild={true}>
            <Link href="/dashboard/create">{t('firstProject')}</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
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
      {jobs.length ? (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <div className="divide-y">
            {jobs.map((job) => (
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
                      <time dateTime={job.createdAt.toISOString()}>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium'
                        }).format(job.createdAt)}
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
