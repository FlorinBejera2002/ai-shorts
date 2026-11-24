'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/auth'

export interface JobStatus {
  job: {
    id: string
    status: string
    progress: number
    progress_message?: string | null
    error_message?: string | null
    processing_active?: boolean
    audio_cleanup?: { status: 'ready' | 'failed' | 'unchanged' | 'no_audio'; message?: string }
    original_audio_url?: string
    processed_audio_url?: string
    /** Source fields the processing card and job page summarise; the backend may add a title and thumbnail. */
    source_type?: string
    source_url?: string | null
    source_file_path?: string | null
    source_title?: string | null
    source_thumbnail_url?: string | null
    num_clips_requested?: number
    aspect_ratio?: string | null
    subtitle_style?: string | null
  }
  celery_state?: string | null
  celery_meta?: {
    progress?: number
    message?: string
  } | null
}

/** Sentinel errors the page translates; any other error text comes from the API. */
export const JOB_LOAD_ERROR = '__loadError'
export const JOB_CONNECTION_LOST = '__connectionLost'

const POLL_INTERVAL_MS = 5000
const MAX_CONSECUTIVE_ERRORS = 5
const NON_RETRYABLE_STATUSES = [400, 401, 403, 404, 422]

/** Polling stops once the job will not change without a user action. */
function isSettled(job: JobStatus['job'] | undefined) {
  return (
    job?.status === 'completed' ||
    job?.status === 'failed' ||
    (job?.status === 'cancelled' && !job.processing_active)
  )
}

/** Human-readable message from a FastAPI-style or plain error body. */
function errorMessageFrom(data: { detail?: unknown; error?: string }) {
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((entry: { msg?: string }) => entry.msg)
      .filter(Boolean)
      .join('; ')
  }
  return data.error
}

/**
 * Polls one clip job every few seconds until it settles or the load keeps failing.
 * Reloading (a new `reloadToken`) restarts polling from scratch.
 */
export function useJobStatus(jobId: string, reloadToken: number) {
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let consecutiveErrors = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    setStatus(null)
    setError(null)

    const scheduleNextPoll = () => {
      if (active) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS)
    }

    const failLoad = (message: string) => {
      if (active) setError(message)
    }

    async function poll() {
      try {
        const res = await apiFetch(`/api/jobs/${jobId}`, { cache: 'no-store', signal: controller.signal })
        const data = await res.json()
        if (!active) return
        if (!res.ok) {
          consecutiveErrors++
          if (NON_RETRYABLE_STATUSES.includes(res.status) || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            failLoad(errorMessageFrom(data) || JOB_LOAD_ERROR)
            return
          }
          scheduleNextPoll()
          return
        }
        consecutiveErrors = 0
        setError(null)
        setStatus(data)
        if (isSettled(data.job)) return
      } catch {
        consecutiveErrors++
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          failLoad(JOB_CONNECTION_LOST)
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
  }, [jobId, reloadToken])

  return { status, error }
}
