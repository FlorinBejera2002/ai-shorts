'use client'

import { Link } from '@/i18n/navigation'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Check, ArrowRight, AlertCircle } from 'lucide-react'

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

const steps = [
  { key: 'pending', label: 'Queued' },
  { key: 'downloading', label: 'Download' },
  { key: 'transcribing', label: 'Transcribe' },
  { key: 'analyzing', label: 'AI Analyze' },
  { key: 'clipping', label: 'Extract' },
  { key: 'rendering', label: 'Render' },
  { key: 'completed', label: 'Done' },
]

export default function JobProgressPage() {
  const params = useParams<{ id: string }>()
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let errorCount = 0

    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${params.id}`, { cache: 'no-store' })
        const data = await res.json()
        if (!active) return
        if (!res.ok) {
          setError(data.error ?? data.detail ?? 'Could not load job')
          return
        }
        errorCount = 0
        setError(null)
        setStatus(data)
      } catch {
        errorCount++
        if (errorCount >= 5 && active)
          setError('Connection lost. Please refresh.')
      }
    }

    void poll()
    const interval = setInterval(() => void poll(), 2000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [params.id])

  const progress = status?.celery_meta?.progress ?? status?.job.progress ?? 0
  const message =
    status?.celery_meta?.message ??
    status?.job.progress_message ??
    'Waiting for worker…'
  const currentStep = status?.job.status ?? 'pending'
  const currentIdx = steps.findIndex((s) => s.key === currentStep)
  const isDone = currentStep === 'completed'
  const isFailed = currentStep === 'failed'

  return (
    <div className="max-w-2xl animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Processing</h1>
        {isDone && (
          <Link
            href="/dashboard/clips"
            className="flex items-center gap-1 text-[13px] font-medium text-primary hover:underline underline-offset-4"
          >
            View clips
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {error && (
        <div className="mt-4 animate-slide-down flex items-center gap-2 rounded-lg border-l-2 border-red-500 bg-red-500/5 px-3.5 py-2.5 text-[13px] text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>{message}</span>
          <span className="tabular-nums font-medium">{progress}%</span>
        </div>
        <div className="progress-bar h-1.5">
          <div
            className={`progress-bar-fill ${isDone ? 'done' : ''}`}
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-8 relative">
        <div className="absolute top-3 left-3 right-3 h-px bg-border" />

        <div className="relative flex justify-between">
          {steps.map((step, i) => {
            const done = i < currentIdx || isDone
            const active = i === currentIdx && !isDone && !isFailed
            return (
              <div
                key={step.key}
                className="flex flex-col items-center gap-2 animate-slide-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="relative">
                  {active && (
                    <span
                      className="absolute inset-0 rounded-full bg-primary/30"
                      style={{
                        animation: 'pulse-ring 2s ease-out infinite',
                      }}
                    />
                  )}
                  <div
                    className={`relative w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                      done
                        ? 'border-primary bg-primary scale-100'
                        : active
                          ? 'border-primary bg-primary/20 scale-110'
                          : 'border-border bg-card'
                    }`}
                  >
                    {done && (
                      <Check
                        className="w-3 h-3 text-primary-foreground"
                        strokeWidth={3}
                      />
                    )}
                    {active && (
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-medium transition-colors ${
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

      {isFailed && status?.job.error_message && (
        <div className="mt-6 animate-slide-up rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-[13px] font-medium text-red-400">
            Processing failed
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.job.error_message}
          </p>
        </div>
      )}

      {isDone && (
        <div className="mt-6 animate-scale-in flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4 text-emerald-500" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-emerald-400">
              All clips ready
            </p>
            <p className="text-xs text-muted-foreground">
              Your clips have been processed successfully
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
