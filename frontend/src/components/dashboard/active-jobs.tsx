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

const ACTIVE_STATUSES = [
  'pending',
  'downloading',
  'transcribing',
  'analyzing',
  'clipping',
  'rendering',
  // Retain legacy worker states while queued jobs transition to the new pipeline.
  'detecting',
  'generating',
  'processing'
]

export function ActiveJobs() {
  const t = useTranslations('dashboard')
  const [jobs, setJobs] = useState<ActiveJob[]>([])
  const [loading, setLoading] = useState(true)

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
    text: string
  }

  const statusMap: Record<string, StatusInfo> = {
    pending: {
      icon: Clock,
      color: 'text-amber-600 dark:text-amber-400',
      text: t('statusPending')
    },
    downloading: {
      icon: Loader2,
      color: 'text-blue-600 dark:text-blue-400',
      text: t('statusDownloading')
    },
    transcribing: {
      icon: Loader2,
      color: 'text-indigo-600 dark:text-indigo-400',
      text: t('statusTranscribing')
    },
    analyzing: {
      icon: Loader2,
      color: 'text-primary',
      text: t('statusDetecting')
    },
    clipping: {
      icon: Loader2,
      color: 'text-sky-700 dark:text-sky-400',
      text: t('statusClipping')
    },
    rendering: {
      icon: Loader2,
      color: 'text-cyan-700 dark:text-cyan-400',
      text: t('statusRendering')
    },
    detecting: {
      icon: Loader2,
      color: 'text-primary',
      text: t('statusDetecting')
    },
    generating: {
      icon: Loader2,
      color: 'text-sky-700 dark:text-sky-400',
      text: t('statusGenerating')
    },
    processing: {
      icon: Loader2,
      color: 'text-cyan-700 dark:text-cyan-400',
      text: t('statusProcessing')
    }
  }

  const getStatusInfo = (status: string): StatusInfo =>
    statusMap[status] ?? (statusMap.processing as StatusInfo)

  return (
    <div className="panel p-5">
      <h2 className="section-label">{t('activeJobs')}</h2>
      {loading ? (
        <div className="mt-4 flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length > 0 ? (
        <div className="mt-4 space-y-3">
          {jobs.map((job) => {
            const statusInfo = getStatusInfo(job.status)
            const StatusIcon = statusInfo.icon
            return (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                className="group block transition-colors"
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                    {job.sourceUrl ?? job.sourceFilePath ?? 'Processing...'}
                  </div>
                  <div
                    className={`flex shrink-0 items-center gap-1 text-[11px] ${statusInfo.color}`}
                  >
                    {statusInfo.icon === Loader2 ? (
                      <StatusIcon className="h-3 w-3 animate-spin" />
                    ) : (
                      <StatusIcon className="h-3 w-3" strokeWidth={1.75} />
                    )}
                    <span className="hidden sm:inline">
                      {job.progressMessage ?? statusInfo.text}
                    </span>
                    <span>{Math.min(job.progress, 100)}%</span>
                  </div>
                </div>
                <div
                  className="h-1 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={job.progressMessage ?? statusInfo.text}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(job.progress, 100)}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(job.progress, 100)}%` }}
                  />
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="mt-4 py-4 text-center text-xs text-muted-foreground">
          {t('noActiveJobs')}
        </p>
      )}
    </div>
  )
}
