import { Link } from '@/i18n/navigation'
import { ArrowUpRight, CheckCircle2, Film, Sparkles } from 'lucide-react'

import { auth } from '@/lib/auth'
import { getClipReadiness } from '@/lib/clip-readiness'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export default async function ReviewPage() {
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
              status: true,
            },
          },
        },
      })
    : []

  const rows = clips.map((clip) => ({
    clip,
    readiness: getClipReadiness(clip),
  }))
  const readyCount = rows.filter((row) => row.readiness.score >= 85).length
  const needsReview = rows.filter(
    (row) => row.readiness.score >= 65 && row.readiness.score < 85,
  ).length

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Review queue</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Prioritize clips by viral score, export readiness and missing publishing steps.
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate more
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
        {[
          { label: 'Total clips', value: rows.length },
          { label: 'Ready to post', value: readyCount },
          { label: 'Needs review', value: needsReview },
        ].map((stat) => (
          <div key={stat.label} className="bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>

      {rows.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[1.3fr_0.5fr_0.6fr_0.5fr_40px] gap-3 border-b border-border bg-muted/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Clip</span>
            <span>Viral</span>
            <span>Readiness</span>
            <span>Duration</span>
            <span />
          </div>
          <div className="divide-y divide-border bg-card">
            {rows.map(({ clip, readiness }) => (
              <Link
                key={clip.id}
                href={`/dashboard/clips/${clip.id}`}
                className="grid grid-cols-[1.3fr_0.5fr_0.6fr_0.5fr_40px] gap-3 px-3 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{clip.title}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {clip.hookText ?? clip.job.sourceUrl ?? clip.job.sourceFilePath ?? 'Generated clip'}
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary tabular-nums">
                    {clip.viralScore || '-'}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium tabular-nums">
                      {readiness.score}
                    </span>
                    {readiness.score >= 85 && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    )}
                  </div>
                  <div className="mt-1 progress-bar h-1">
                    <div
                      className="progress-bar-fill done"
                      style={{ width: `${readiness.score}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center text-[13px] text-muted-foreground">
                  {Math.round(clip.duration)}s
                </div>
                <div className="flex items-center justify-end">
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-8 rounded-lg bg-muted/50 px-4 py-10 text-center">
          <Film className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-[13px] text-muted-foreground">No clips to review yet</p>
          <Link
            href="/dashboard/create"
            className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline underline-offset-4"
          >
            Create your first project
          </Link>
        </div>
      )}
    </div>
  )
}
