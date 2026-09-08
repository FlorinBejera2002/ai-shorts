'use client'

import { apiFetch } from '@/lib/auth'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Link } from '@/i18n/navigation'
import { CheckCheck, Clock, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

interface ActiveJob {
  id: string
  source_url: string | null
  source_file_path: string | null
  status: string
  progress: number
  progress_message: string | null
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
  const s = useTranslations('dashboard.studio')
  const [jobs, setJobs] = useState<ActiveJob[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let mounted = true
    async function poll() {
      try {
        const res = await apiFetch('/api/jobs')
        if (!res.ok) throw new Error('Unable to load jobs')
        if (res.ok && mounted) {
          const data = await res.json()
          const active = (data.jobs ?? []).filter((j: ActiveJob) =>
            ACTIVE_STATUSES.includes(j.status)
          )
          setJobs(active)
          setFailed(false)
        }
      } catch {
        if (mounted) setFailed(true)
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
    <Card className="gap-4 rounded-lg border bg-card py-5 shadow-none">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base tracking-tight">{t('activeJobs')}</h2>
        </CardTitle>
        <CardDescription className="text-xs">
          {s('queueDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failed && (
          <p role="status" className="mb-3 text-xs text-destructive">
            {s('queueError')}
          </p>
        )}
        {loading ? (
          <div
            className="space-y-3"
            aria-label={s('queueLoading')}
            role="status"
          >
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-1/2" />
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
                  <div className="flex flex-col items-start gap-2 mb-3">
                    <div className="min-w-0 w-full truncate text-[12px] font-medium text-foreground">
                      {job.source_url ??
                        job.source_file_path ??
                        t('statusProcessing')}
                    </div>
                    <div
                      className={`flex shrink-0 items-center gap-1 text-[11px] ${statusInfo.color}`}
                    >
                      {statusInfo.icon === Loader2 ? (
                        <StatusIcon className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <StatusIcon className="h-3 w-3" strokeWidth={1.75} />
                      )}
                      <span className="inline">
                        {job.progress_message ?? statusInfo.text}
                      </span>
                      <span>{Math.min(job.progress, 100)}%</span>
                    </div>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={job.progress_message ?? statusInfo.text}
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
        ) : !failed ? (
          <div className="flex flex-col items-center px-2 py-5 text-center">
            <CheckCheck
              className="mb-3 size-6 text-primary/70"
              strokeWidth={1.5}
            />
            <p className="text-xs font-medium">{t('noActiveJobs')}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {s('queueEmpty')}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
