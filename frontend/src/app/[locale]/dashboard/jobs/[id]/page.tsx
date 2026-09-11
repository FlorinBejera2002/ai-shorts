'use client'

import '@/components/clips/media-workbench.css'

import { apiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'

import { JobProcessingHeader } from '@/components/jobs/job-processing-header'
import { JobProcessingPanel } from '@/components/jobs/job-processing-panel'

import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

type JobStatus = {
  job: {
    id: string
    status: string
    progress: number
    progress_message?: string | null
    error_message?: string | null
  }
  celery_state?: string | null
  celery_meta?: {
    progress?: number
    message?: string
  } | null
}

export default function JobProgressPage() {
  const params = useParams<{ id: string }>()
  const t = useTranslations('jobProgress')
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry deliberately restarts polling after a failed request.
  useEffect(() => {
    let active = true
    let errorCount = 0
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    setStatus(null)
    setError(null)

    function scheduleNextPoll() {
      if (active) timer = setTimeout(() => void poll(), 5000)
    }

    async function poll() {
      try {
        const res = await apiFetch(`/api/jobs/${params.id}`, {
          cache: 'no-store',
          signal: controller.signal
        })
        const data = await res.json()
        if (!active) return
        if (!res.ok) {
          const msg =
            typeof data.detail === 'string'
              ? data.detail
              : Array.isArray(data.detail)
                ? data.detail
                    .map((e: { msg?: string }) => e.msg)
                    .filter(Boolean)
                    .join('; ')
                : data.error
          errorCount++
          if (
            [400, 401, 403, 404, 422].includes(res.status) ||
            errorCount >= 5
          ) {
            setError(msg || '__loadError')
            return
          }
          scheduleNextPoll()
          return
        }
        errorCount = 0
        setError(null)
        setStatus(data)

        const jobStatus = data.job?.status
        if (
          jobStatus === 'completed' ||
          jobStatus === 'failed' ||
          jobStatus === 'cancelled'
        ) {
          return
        }
      } catch {
        errorCount++
        if (errorCount >= 5 && active) {
          setError('__connectionLost')
          return
        }
      }
      scheduleNextPoll()
    }

    void poll()
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [params.id, retry])

  const progress = status?.celery_meta?.progress ?? status?.job.progress ?? 0
  const currentStep = status?.job.status ?? 'pending'
  const isDone = currentStep === 'completed'
  const isFailed = currentStep === 'failed'
  const isCancelled = currentStep === 'cancelled'
  const message = isCancelled
    ? t('cancelledTitle')
    : isFailed
      ? t('failedTitle')
      : isDone
        ? t('doneTitle')
        : (status?.celery_meta?.message ??
          status?.job.progress_message ??
          t('waitingWorker'))

  return (
    <div className="media-workbench dashboard-workspace job-workspace w-full animate-fade-in">
      <JobProcessingHeader
        status={currentStep}
        progress={progress}
        message={message}
        connected={Boolean(status) && !error}
      />

      {/* Error banner */}
      {error && (
        <div className="mb-6 animate-slide-down flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle
            className="w-5 h-5 shrink-0 text-destructive mt-0.5"
            strokeWidth={1.75}
          />
          <div>
            <p className="text-sm font-medium text-destructive shadow-lg shadow-destructive/5">
              {error === '__loadError'
                ? t('loadError')
                : error === '__connectionLost'
                  ? t('connectionLost')
                  : error}
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => setRetry((value) => value + 1)}
            >
              {t('retry')}
            </Button>
          </div>
        </div>
      )}

      <JobProcessingPanel
        status={currentStep}
        progress={progress}
        message={message}
        errorMessage={status?.job.error_message}
        connected={Boolean(status) && !error}
      />
    </div>
  )
}
