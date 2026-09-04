'use client'

import { Link } from '@/i18n/navigation'
import { AlertCircle, ArrowRight, Check } from 'lucide-react'
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

  const steps = [
    { key: 'pending', label: t('stepQueued') },
    { key: 'downloading', label: t('stepDownload') },
    { key: 'transcribing', label: t('stepTranscribe') },
    { key: 'analyzing', label: t('stepAnalyze') },
    { key: 'clipping', label: t('stepExtract') },
    { key: 'rendering', label: t('stepRender') },
    { key: 'completed', label: t('stepDone') }
  ]

  useEffect(() => {
    let active = true
    let errorCount = 0
    let timer: ReturnType<typeof setTimeout>

    function scheduleNextPoll() {
      if (active) timer = setTimeout(() => void poll(), 5000)
    }

    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${params.id}`, { cache: 'no-store' })
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
          if (errorCount >= 5) {
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
      clearTimeout(timer)
    }
  }, [params.id])

  const progress = status?.celery_meta?.progress ?? status?.job.progress ?? 0
  const message =
    status?.celery_meta?.message ??
    status?.job.progress_message ??
    t('waitingWorker')
  const currentStep = status?.job.status ?? 'pending'
  const currentIdx = steps.findIndex((s) => s.key === currentStep)
  const isDone = currentStep === 'completed'
  const isFailed = currentStep === 'failed'

  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        {isDone && (
          <Link
            href="/dashboard/clips"
            className="button-primary self-start rounded-lg sm:self-auto"
          >
            {t('viewClips')}
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        )}
      </div>

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
          </div>
        </div>
      )}

      {/* Progress info */}
      <div className="panel mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p
              className="text-sm font-semibold text-foreground"
              aria-live="polite"
            >
              {message}
            </p>
            {!isDone && !isFailed && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('eta', { min: Math.max(1, 5 - Math.floor(progress / 20)) })}
              </p>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-3xl font-bold tabular-nums ${isDone ? 'text-success' : 'text-primary'}`}
            >
              {progress}
            </span>
            <span className="text-sm font-medium text-muted-foreground">%</span>
          </div>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={message}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, progress))}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${isDone ? 'bg-success' : 'bg-primary'}`}
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`
            }}
          />
        </div>
      </div>

      {/* Stepper */}
      <div className="panel p-4 sm:p-6">
        <div className="relative">
          {/* Connecting line */}
          <div className="pointer-events-none absolute left-3 right-3 top-5 hidden h-px bg-border lg:block" />

          <div className="relative grid gap-2 lg:grid-cols-7 lg:gap-1">
            {steps.map((step, i) => {
              const done = i < currentIdx || isDone
              const active = i === currentIdx && !isDone && !isFailed
              return (
                <div
                  key={step.key}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 animate-slide-up lg:flex-col lg:bg-transparent lg:px-0 lg:py-0"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {/* Circle */}
                  <div className="relative z-10">
                    {active && (
                      <span
                        className="absolute -inset-1 rounded-full bg-primary/20"
                        style={{
                          animation: 'pulse 2s ease-in-out infinite'
                        }}
                      />
                    )}
                    <div
                      className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 font-semibold transition-all duration-300 ${
                        done
                          ? 'border-success bg-success text-success-foreground'
                          : active
                            ? 'border-primary bg-primary/10 text-primary lg:scale-110'
                            : 'border-border bg-card text-muted-foreground'
                      }`}
                    >
                      {done ? (
                        <Check className="w-5 h-5" strokeWidth={2.5} />
                      ) : active ? (
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      ) : (
                        <span className="text-xs">{i + 1}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-left text-[12px] font-medium leading-tight transition-colors lg:text-center ${
                      done || active
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Failed state */}
      {isFailed && status?.job.error_message && (
        <div className="mt-6 animate-slide-up rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-lg shadow-destructive/5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 shrink-0">
              <AlertCircle
                className="w-5 h-5 text-destructive"
                strokeWidth={1.75}
              />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-destructive">
                {t('failedTitle')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {status.job.error_message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {isDone && (
        <div className="mt-6 animate-scale-in rounded-xl border border-success/30 bg-success/5 p-5 shadow-lg shadow-success/5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 shrink-0">
              <Check className="w-5 h-5 text-success" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-success">{t('doneTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('doneDesc')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
