'use client'

import { Button } from '@/components/ui/button'

import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'

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
  const [retry, setRetry] = useState(0)

  const steps = [
    { key: 'pending', label: t('stepQueued') },
    { key: 'downloading', label: t('stepDownload') },
    { key: 'transcribing', label: t('stepTranscribe') },
    { key: 'analyzing', label: t('stepAnalyze') },
    { key: 'clipping', label: t('stepExtract') },
    { key: 'rendering', label: t('stepRender') },
    { key: 'completed', label: t('stepDone') }
  ]

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
        const res = await fetch(`/api/jobs/${params.id}`, {
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
  const currentIdx = steps.findIndex((s) => s.key === currentStep)
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
    <div className="mx-auto max-w-5xl animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          isDone ? (
            <Button asChild={true} variant="default">
              <Link href="/dashboard/clips" className="">
                {t('viewClips')}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : undefined
        }
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

      {/* Progress info */}
      <Card className="block gap-0 py-0 mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p
              className="text-sm font-semibold text-foreground"
              aria-live="polite"
            >
              {message}
            </p>
            {status && !error && !isDone && !isFailed && !isCancelled && (
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
        <Progress
          value={progress}
          aria-label={message}
          className={isDone ? '[&>div]:bg-success' : undefined}
        />
      </Card>

      {/* Stepper */}
      <Card className="block gap-0 py-0 p-4 sm:p-6">
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
      </Card>

      {/* Failed state */}
      {isFailed && (
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
                {status?.job.error_message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {isCancelled && (
        <Card className="mt-6 p-5" role="status">
          <p className="font-semibold">{t('cancelledTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('cancelledDesc')}</p>
          <Button asChild={true} variant="outline">
            <Link href="/dashboard/create">{t('newProject')}</Link>
          </Button>
        </Card>
      )}
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
