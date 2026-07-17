import { Link } from '@/i18n/navigation'
import {
  CheckCircle2,
  Film,
  Scissors,
  Sparkles,
  TrendingUp
} from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { auth } from '@/lib/auth'
import { getClipReadiness } from '@/lib/clip-readiness'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export default async function ReviewPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('review')

  const session = await auth()
  const clips = session?.user?.id
    ? await prisma.clip.findMany({
        where: { userId: session.user.id },
        orderBy: [{ viralScore: 'desc' }, { createdAt: 'desc' }],
        take: 80,
        include: {
          job: {
            select: {
              sourceUrl: true,
              sourceFilePath: true,
              status: true
            }
          }
        }
      })
    : []

  const rows = clips.map((clip) => ({
    clip,
    readiness: getClipReadiness(clip)
  }))
  const readyCount = rows.filter((row) => row.readiness.score >= 85).length
  const needsReview = rows.filter(
    (row) => row.readiness.score >= 65 && row.readiness.score < 85
  ).length

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('desc')}
        actions={
          <Link
            href="/dashboard/create"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg hover:shadow-primary/20"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            {t('generateMore')}
          </Link>
        }
      />

      {/* Stats cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: t('totalClips'),
            value: rows.length,
            icon: Film,
            color: 'primary'
          },
          {
            label: t('readyToPost'),
            value: readyCount,
            icon: CheckCircle2,
            color: 'success'
          },
          {
            label: t('needsReview'),
            value: needsReview,
            icon: TrendingUp,
            color: 'accent'
          }
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-foreground tabular-nums">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    stat.color === 'primary'
                      ? 'bg-primary/10 text-primary'
                      : stat.color === 'success'
                        ? 'bg-success/10 text-success'
                        : 'bg-accent/10 text-accent'
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Clips table */}
      {rows.length > 0 ? (
        <div className="mt-8">
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{t('clip')}</span>
              <span className="text-right">{t('viral')}</span>
              <span className="text-right">{t('readiness')}</span>
              <span className="text-right">{t('duration')}</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {rows.map(({ clip, readiness }) => (
                <Link
                  key={clip.id}
                  href={`/dashboard/clips/${clip.id}`}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {clip.title}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {clip.hookText ??
                        clip.job.sourceUrl ??
                        clip.job.sourceFilePath ??
                        'Generated clip'}
                    </div>
                  </div>
                  <div className="flex items-center shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary tabular-nums">
                      {clip.viralScore ?? '-'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end justify-center gap-1.5 shrink-0">
                    <span className="text-sm font-medium text-foreground tabular-nums">
                      {readiness.score}
                    </span>
                    <div className="progress-bar h-1.5 w-20">
                      <div
                        className="progress-bar-fill done"
                        style={{ width: `${readiness.score}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground tabular-nums shrink-0">
                    {Math.round(clip.duration)}s
                  </div>
                  <div className="flex items-center justify-center shrink-0">
                    {readiness.score >= 85 ? (
                      <CheckCircle2
                        className="h-5 w-5 text-success"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <Scissors
                        className="h-4 w-4 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState
            icon={Film}
            title="No clips to review yet"
            description="Generate your first project to see clips here. All clips will be ranked by viral potential."
            action={
              <Link
                href="/dashboard/create"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-all"
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                {t('firstProject')}
              </Link>
            }
          />
        </div>
      )}
    </div>
  )
}
