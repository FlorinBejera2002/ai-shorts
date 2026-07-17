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
          setError(msg || '__loadError')
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
      if (active) {
        timer = setTimeout(() => void poll(), 5000)
      }
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
    <div className="max-w-2xl animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {t('title')}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        {isDone && (
          <Link
            href="/dashboard/clips"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-all"
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
            <p className="text-sm font-medium text-destructive">
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
      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{message}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('eta', { min: Math.max(1, 5 - Math.floor(progress / 20)) })}
            </p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-primary tabular-nums">
              {progress}
            </span>
            <span className="text-sm font-medium text-muted-foreground">%</span>
          </div>
        </div>
        <div className="progress-bar h-2">
          <div
            className={`progress-bar-fill ${isDone ? 'done' : ''}`}
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`
            }}
          />
        </div>
      </div>

      {/* Stepper */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute top-5 left-3 right-3 h-0.5 bg-border pointer-events-none" />

          <div className="relative flex justify-between">
            {steps.map((step, i) => {
              const done = i < currentIdx || isDone
              const active = i === currentIdx && !isDone && !isFailed
              return (
                <div
                  key={step.key}
                  className="flex flex-col items-center gap-3 animate-slide-up"
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
                          ? 'border-primary bg-primary text-primary-foreground'
                          : active
                            ? 'border-primary bg-primary/15 text-primary scale-110'
                            : 'border-border bg-card text-muted-foreground'
                      }`}
                    >
                      {done ? (
                        <Check className="w-5 h-5" strokeWidth={2.5} />
                      ) : active ? (
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      ) : (
                        <span className="text-xs">{i + 1}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[12px] font-medium text-center leading-tight transition-colors ${
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
        <div className="mt-6 animate-slide-up rounded-xl border border-destructive/30 bg-destructive/5 p-5">
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
        <div className="mt-6 animate-scale-in rounded-xl border border-success/30 bg-success/5 p-5">
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
