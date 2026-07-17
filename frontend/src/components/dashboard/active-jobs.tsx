'use client'

import { Link } from '@/i18n/navigation'
import { Clock, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

interface ActiveJob {
  id: string
  sourceUrl: string | null
  sourceFilePath: string | null
  status: string
  progress: number
  progressMessage: string | null
}

export function ActiveJobs() {
  const t = useTranslations('dashboard')
  const [jobs, setJobs] = useState<ActiveJob[]>([])
  const [loading, setLoading] = useState(true)

  const ACTIVE_STATUSES = [
    'pending',
    'downloading',
    'transcribing',
    'detecting',
    'generating',
    'processing'
  ]

  useEffect(() => {
    let mounted = true
    async function poll() {
      try {
        const res = await fetch('/api/jobs')
        if (res.ok && mounted) {
          const data = await res.json()
          const active = (data.jobs ?? []).filter((j: ActiveJob) =>
            ACTIVE_STATUSES.includes(j.status)
          )
          setJobs(active)
        }
      } catch {
        // silent — polling will retry
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void poll()
    const interval = setInterval(poll, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  type StatusInfo = {
    icon: typeof Clock | typeof Loader2
    color: string
    bg: string
    text: string
  }

  const statusMap: Record<string, StatusInfo> = {
    pending: {
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-500/10',
      text: 'Pending'
    },
    downloading: {
      icon: Loader2,
      color: 'text-blue-600',
      bg: 'bg-blue-500/10',
      text: 'Downloading'
    },
    transcribing: {
      icon: Loader2,
      color: 'text-indigo-600',
      bg: 'bg-indigo-500/10',
      text: 'Transcribing'
    },
    detecting: {
      icon: Loader2,
      color: 'text-violet-600',
      bg: 'bg-violet-500/10',
      text: 'Detecting'
    },
    generating: {
      icon: Loader2,
      color: 'text-purple-600',
      bg: 'bg-purple-500/10',
      text: 'Generating'
    },
    processing: {
      icon: Loader2,
      color: 'text-pink-600',
      bg: 'bg-pink-500/10',
      text: 'Processing'
    }
  }

  const getStatusInfo = (status: string): StatusInfo => {
    return statusMap[status] ?? (statusMap.processing as StatusInfo)
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('activeJobs')}
        </h2>
        <div className="mt-4 flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('activeJobs')}
      </h2>
      {jobs.length > 0 ? (
        <div className="mt-4 space-y-2.5">
          {jobs.map((job, i) => {
            const statusInfo = getStatusInfo(job.status)
            const StatusIcon = statusInfo.icon
            return (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                className="group block rounded-lg border border-transparent bg-muted/30 p-3.5 transition-all duration-300 hover:border-border hover:bg-muted/60 animate-slide-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-foreground truncate">
                      {job.sourceUrl ?? job.sourceFilePath ?? 'Processing...'}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <div
                        className={`flex items-center gap-1 ${statusInfo.color}`}
                      >
                        {statusInfo.icon === Loader2 ? (
                          <StatusIcon className="h-3 w-3 animate-spin" />
                        ) : (
                          <StatusIcon className="h-3 w-3" strokeWidth={1.75} />
                        )}
                        <span className="capitalize">
                          {job.progressMessage ?? job.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${statusInfo.bg}`}
                  >
                    <span className="text-xs font-bold text-foreground">
                      {Math.min(job.progress, 100)}%
                    </span>
                  </div>
                </div>
                <div className="progress-bar h-1">
                  <div
                    className={`progress-bar-fill ${job.progress === 100 ? 'done' : ''}`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground text-center py-4">
          {t('noActiveJobs')}
        </p>
      )}
    </div>
  )
}
