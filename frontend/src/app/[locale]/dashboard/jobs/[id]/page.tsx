'use client'

import '@/components/clips/media-workbench.css'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { toast } from '@/lib/toast'
import { JobAudioCleanup } from '@/components/jobs/job-audio-cleanup'
import { JobLoadError } from '@/components/jobs/job-load-error'
import { JobProcessingPanel } from '@/components/jobs/job-processing-panel'
import { cancelJob, JobActionError, retryJob } from '@/components/jobs/job-actions'
import { useJobStatus } from '@/components/jobs/use-job-status'
import { JobSourceBar } from '@/components/jobs/job-source-bar'
import { jobSourceCard } from '@/components/jobs/job-source-model'
import { useCreateText } from '@/components/create/create-text'
import theme from '@/components/calendar/publishing-theme.module.css'

/** Latest progress and status for the processing card; the worker's live progress wins. */
function jobState(status: ReturnType<typeof useJobStatus>['status']) {
  return {
    progress: status?.celery_meta?.progress ?? status?.job.progress ?? 0,
    currentStep: status?.job.status ?? 'pending'
  }
}

export default function JobProgressPage() {
  const params = useParams<{ id: string }>()
  const tAudio = useTranslations('audioCleanup')
  const tJob = useTranslations('jobProgress')
  const [reload, setReload] = useState(0)
  const [actionBusy, setActionBusy] = useState(false)
  // A ref, not state, so two clicks in the same tick cannot both start an action.
  const actionInFlight = useRef(false)
  const retryRequest = useRef<{ id: string; keepOriginalAudio: boolean } | null>(null)
  const { status, error } = useJobStatus(params.id, reload)
  const text = useCreateText()

  const requestReload = () => setReload((value) => value + 1)

  /**
   * Runs one job action at a time; resolves true when the action succeeded. A refused action shows
   * its localized message: a 409 uses `conflict` when given, every other failure uses `fallback`.
   */
  async function runAction(action: () => Promise<void>, messages: { fallback: string; conflict?: string }): Promise<boolean> {
    if (actionInFlight.current) return false
    actionInFlight.current = true
    setActionBusy(true)
    try {
      await action()
      requestReload()
      return true
    } catch (cause) {
      const conflict = cause instanceof JobActionError && cause.status === 409 ? messages.conflict : undefined
      toast.error(conflict ?? messages.fallback)
      return false
    } finally {
      actionInFlight.current = false
      setActionBusy(false)
    }
  }

  /** Retries reuse one request id per option set so a double click cannot start two retries. */
  async function retry(keepOriginalAudio: boolean) {
    let request = retryRequest.current
    if (!request || request.keepOriginalAudio !== keepOriginalAudio) {
      request = { id: crypto.randomUUID(), keepOriginalAudio }
      retryRequest.current = request
    }
    const requestId = request.id
    const retried = await runAction(
      () => retryJob(params.id, requestId, { keepOriginalAudio }),
      { fallback: tAudio('retryFailed'), conflict: tJob('retryUnavailable') },
    )
    if (retried) retryRequest.current = null
  }

  const { progress, currentStep } = jobState(status)
  const job = status?.job ?? {}
  const source = jobSourceCard(job, text)
  const processingActive = Boolean(status?.job.processing_active)

  return (
    // Canvas page frame: reference surface, with clearance above the phone dock and the floating assistant.
    <div className={`${theme.surface} media-workbench dashboard-workspace job-workspace w-full animate-fade-in pb-28 lg:px-12 lg:pb-24`} data-reference-surface="">
      {error && <JobLoadError error={error} onRetry={requestReload} />}

      {(!error || status) && <JobSourceBar job={job} />}

      {(!error || status) && (
        <JobProcessingPanel
          jobId={params.id}
          status={currentStep}
          progress={progress}
          errorMessage={status?.job.error_message}
          source={source}
          connected={Boolean(status) && !error}
          busy={actionBusy}
          onCancel={() => void runAction(() => cancelJob(params.id), { fallback: tAudio('retryFailed') })}
          onRetry={() => void retry(false)}
        />
      )}
      {status && (
        <JobAudioCleanup
          job={status.job}
          busy={actionBusy || processingActive}
          onKeepOriginalAudio={() => void retry(true)}
        />
      )}
    </div>
  )
}
