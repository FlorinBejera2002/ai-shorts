import { Link } from '@/i18n/navigation'
import { ChevronRight } from 'lucide-react'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export default async function HistoryPage() {
  const session = await auth()
  const jobs = session?.user?.id
    ? await prisma.job.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { _count: { select: { clips: true } } },
      })
    : []

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight">History</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {jobs.length} job{jobs.length !== 1 ? 's' : ''} total
      </p>

      {jobs.length > 0 ? (
        <div className="mt-5 space-y-1">
          {jobs.map((job, i) => (
            <Link
              key={job.id}
              href={
                job.status === 'completed'
                  ? '/dashboard/clips'
                  : `/dashboard/jobs/${job.id}`
              }
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50 group animate-slide-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <StatusDot status={job.status} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">
                  {job.sourceUrl ?? job.sourceFilePath ?? 'Unknown source'}
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>{job.numClipsRequested} requested</span>
                  <span>{job._count.clips} generated</span>
                  <span>{job.aspectRatio}</span>
                  <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium capitalize ${
                    job.status === 'completed'
                      ? 'text-emerald-500'
                      : job.status === 'failed'
                        ? 'text-red-500'
                        : 'text-muted-foreground'
                  }`}
                >
                  {job.status}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-8 text-center animate-scale-in">
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
  return <span className={`inline-flex h-2 w-2 rounded-full ${color} shrink-0`} />
}
