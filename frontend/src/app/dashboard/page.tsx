import Link from 'next/link'
import { Plus } from 'lucide-react'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export default async function DashboardPage() {
  const session = await auth()
  const userId = session?.user?.id

  const [jobCount, clipCount, recentJobs] = userId
    ? await Promise.all([
        prisma.job.count({ where: { userId } }),
        prisma.clip.count({ where: { userId } }),
        prisma.job.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { _count: { select: { clips: true } } },
        }),
      ])
    : [0, 0, []]

  const credits = session?.user?.credits ?? 0

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Welcome back
            {session?.user?.name ? `, ${session.user.name}` : ''}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Here&apos;s your workspace overview
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" />
          New project
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-px rounded-xl bg-border overflow-hidden animate-slide-up">
        {[
          { label: 'Credits', value: credits },
          { label: 'Jobs', value: jobCount },
          { label: 'Clips', value: clipCount },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="bg-card px-5 py-4"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent jobs
        </h2>
        {recentJobs.length > 0 ? (
          <div className="mt-3 space-y-1">
            {recentJobs.map((job, i) => (
              <Link
                key={job.id}
                href={
                  job.status === 'completed'
                    ? '/dashboard/clips'
                    : `/dashboard/jobs/${job.id}`
                }
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50 animate-slide-up"
                style={{ animationDelay: `${(i + 1) * 60}ms` }}
              >
                <StatusDot status={job.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">
                    {job.sourceUrl ?? job.sourceFilePath ?? 'Unknown source'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {job.numClipsRequested} clips &middot;{' '}
                    {new Date(job.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground capitalize">
                  {job.status}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-muted/50 px-4 py-8 text-center animate-scale-in">
            <p className="text-[13px] text-muted-foreground">No jobs yet</p>
            <Link
              href="/dashboard/create"
              className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline underline-offset-4"
            >
              Create your first project &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'completed'
      ? 'bg-emerald-500'
      : status === 'failed'
        ? 'bg-red-500'
        : status === 'cancelled'
          ? 'bg-zinc-400'
          : 'bg-amber-500'
  const pulsing =
    status !== 'completed' && status !== 'failed' && status !== 'cancelled'
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulsing && (
        <span
          className={`absolute inset-0 rounded-full ${color} opacity-75`}
          style={{ animation: 'pulse-ring 1.5s ease-out infinite' }}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  )
}
