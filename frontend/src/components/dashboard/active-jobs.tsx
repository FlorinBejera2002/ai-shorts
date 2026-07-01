'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Loader2 } from 'lucide-react'

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

  const ACTIVE_STATUSES = ['pending', 'downloading', 'transcribing', 'detecting', 'generating', 'processing']

  useEffect(() => {
    let mounted = true
    async function poll() {
      try {
        const res = await fetch('/api/jobs')
        if (res.ok && mounted) {
          const data = await res.json()
          const active = (data.jobs ?? []).filter(
            (j: ActiveJob) => ACTIVE_STATUSES.includes(j.status)
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
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('activeJobs')}
        </h2>
        <div className="mt-4 flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
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
        <div className="mt-3 space-y-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/dashboard/jobs/${job.id}`}
              className="block rounded-lg p-2 transition-colors hover:bg-muted/50"
            >
              <div className="text-[13px] font-medium truncate">
                {job.sourceUrl ?? job.sourceFilePath ?? 'Processing...'}
              </div>
              <div className="mt-2 progress-bar h-1.5">
                <div
                  className={`progress-bar-fill ${job.status === 'completed' ? 'done' : ''}`}
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{job.progressMessage ?? job.status}</span>
                <span className="tabular-nums">{job.progress}%</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">{t('noActiveJobs')}</p>
      )}
    </div>
  )
}
