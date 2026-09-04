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
import { getPrisma } from '@/lib/db'

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
  const prisma = getPrisma()
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
          <Link href="/dashboard/create" className="button-primary rounded-lg">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            {t('generateMore')}
          </Link>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: t('totalClips'),
            value: rows.length,
            icon: Film,
            color: 'text-primary',
            bg: 'bg-primary/10'
          },
          {
            label: t('readyToPost'),
            value: readyCount,
            icon: CheckCircle2,
            color: 'text-success',
            bg: 'bg-success/10'
          },
          {
            label: t('needsReview'),
            value: needsReview,
            icon: TrendingUp,
            color: 'text-warning',
            bg: 'bg-warning/10'
          }
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="panel-soft flex items-center gap-3 p-4"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}
              >
                <Icon className={`h-4 w-4 ${stat.color}`} strokeWidth={1.75} />
              </span>
              <div>
                <div className="text-xl font-semibold tabular-nums text-foreground">
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Clips table */}
      {rows.length > 0 ? (
        <div className="mt-8">
          <div className="panel overflow-hidden p-0">
            <div className="section-label hidden grid-cols-[minmax(0,1fr)_80px_170px_72px_24px] gap-4 border-b border-border bg-muted/60 px-5 py-3 md:grid">
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
                  className="group grid gap-4 px-4 py-4 transition-colors hover:bg-muted/60 md:grid-cols-[minmax(0,1fr)_80px_170px_72px_24px] md:items-center md:px-5"
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
                  <div className="flex shrink-0 items-center justify-between md:justify-end">
                    <span className="section-label md:hidden">
                      {t('viral')}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                        clip.viralScore >= 8
                          ? 'bg-success/10 text-success'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {clip.viralScore ?? '-'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-4 md:flex-col md:items-end md:justify-center md:gap-1.5">
                    <span className="section-label md:hidden">
                      {t('readiness')}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground tabular-nums">
                        {readiness.score}
                      </span>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted md:w-20">
                        <div
                          className={`h-full rounded-full ${
                            readiness.score >= 85 ? 'bg-success' : 'bg-primary'
                          }`}
                          style={{ width: `${readiness.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between text-sm text-muted-foreground tabular-nums md:justify-end">
                    <span className="section-label md:hidden">
                      {t('duration')}
                    </span>
                    <span>{Math.round(clip.duration)}s</span>
                  </div>
                  <div className="hidden shrink-0 items-center justify-center md:flex">
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
                className="button-primary rounded-lg"
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
