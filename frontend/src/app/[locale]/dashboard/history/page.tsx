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
    <div className="animate-fade-in space-y-8">
      <PageHeader
        title={t('title')}
        description={t('count', { count: jobs.length })}
      />

      {jobs.length > 0 ? (
        <div className="space-y-3">
          {jobs.map((job, i) => (
            <Link
              key={job.id}
              href={
                job.status === 'completed'
                  ? '/dashboard/clips'
                  : `/dashboard/jobs/${job.id}`
              }
              className="panel group flex flex-col gap-4 p-4 transition-all duration-200 hover:border-primary/25 hover:bg-muted/50 sm:flex-row sm:items-center animate-slide-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex min-w-0 w-full items-start gap-3 sm:w-auto sm:flex-1 sm:items-center">
                <StatusIcon status={job.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {job.sourceUrl ?? job.sourceFilePath ?? 'Unknown source'}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                        {job.numClipsRequested}
                      </span>
                      {t('requested')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                        {job._count.clips}
                      </span>
                      {t('generated')}
                    </span>
                    <span>{job.aspectRatio}</span>
                    <span>
                      {new Date(job.createdAt).toLocaleDateString(locale, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t border-border pt-3 sm:w-auto sm:border-0 sm:pt-0">
                <span className={getStatusBadgeClass(job.status)}>
                  {job.status}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Clock}
          title={t('noJobs')}
          description="Create your first project to see it here"
          action={
            <Link
              href="/dashboard/create"
              className="button-primary rounded-lg"
            >
              {t('firstProject')}
            </Link>
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
