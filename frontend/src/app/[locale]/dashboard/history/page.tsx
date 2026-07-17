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
import { prisma } from '@/lib/db'

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
  const jobs = session?.user?.id
    ? await prisma.job.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { _count: { select: { clips: true } } }
      })
    : []

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={t('title')}
        description={t('count', { count: jobs.length })}
      />

      {jobs.length > 0 ? (
        <div className="space-y-2">
          {jobs.map((job, i) => (
            <Link
              key={job.id}
              href={
                job.status === 'completed'
                  ? '/dashboard/clips'
                  : `/dashboard/jobs/${job.id}`
              }
              className="group flex items-center gap-4 rounded-lg border border-border/40 bg-card px-4 py-3 transition-all duration-300 hover:border-primary/30 hover:bg-muted/30 hover:shadow-sm animate-slide-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <StatusIcon status={job.status} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground truncate">
                  {job.sourceUrl ?? job.sourceFilePath ?? 'Unknown source'}
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                      {job.numClipsRequested}
                    </span>
                    {t('requested')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="rounded-full bg-accent/10 px-1.5 py-0.5 font-medium text-accent">
                      {job._count.clips}
                    </span>
                    {t('generated')}
                  </span>
                  <span>{job.aspectRatio}</span>
                  <span className="text-muted-foreground/60">
                    {new Date(job.createdAt).toLocaleDateString(locale, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    job.status === 'completed'
                      ? 'text-emerald-600'
                      : job.status === 'failed'
                        ? 'text-red-600'
                        : job.status === 'cancelled'
                          ? 'text-zinc-600'
                          : 'text-amber-600'
                  }`}
                >
                  {job.status}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
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
              className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-all hover:border-primary/60 hover:bg-primary/20"
            >
              {t('firstProject')}
            </Link>
          }
        />
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  const config = {
    completed: {
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-500/10'
    },
    failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-500/10' },
    cancelled: {
      icon: AlertCircle,
      color: 'text-zinc-600',
      bg: 'bg-zinc-500/10'
    },
    default: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/10' }
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
