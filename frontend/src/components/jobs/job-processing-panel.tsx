'use client'

import { useCreateText } from '@/components/create/create-text'
import type { ProcessingCardSource } from '@/components/create/processing-card'
import { isDurationExceeded, jobProcessingView } from './job-processing-model'
import { jobStageLabels } from './job-processing-copy'
import { JobCompleteCard } from './job-complete-card'
import { JobRunningCard, JobStoppedCard, JobTooLongCard } from './job-processing-states'

interface JobProcessingPanelProps {
  jobId: string
  status: string
  progress: number
  errorMessage?: string | null
  source: ProcessingCardSource
  /** False while the status is stale or unreachable; the card stops animating. */
  connected: boolean
  busy: boolean
  onCancel: () => void
  onRetry: () => void
}

/** Clip-job processing card: picks the card state for the job status. */
export function JobProcessingPanel({
  jobId,
  status,
  progress,
  errorMessage,
  source,
  connected,
  busy,
  onCancel,
  onRetry
}: JobProcessingPanelProps) {
  const text = useCreateText()
  const view = jobProcessingView(jobStageLabels(text), status, progress)

  if (status === 'failed' && isDurationExceeded(errorMessage)) {
    return <JobTooLongCard errorMessage={errorMessage} source={source} />
  }
  if (status === 'failed' || status === 'cancelled') {
    return (
      <JobStoppedCard
        failed={status === 'failed'}
        progress={view.progress}
        stages={view.stages}
        errorMessage={errorMessage}
        source={source}
        busy={busy}
        onRetry={onRetry}
      />
    )
  }
  if (status === 'completed') {
    return <JobCompleteCard jobId={jobId} source={source} />
  }
  return (
    <JobRunningCard
      stage={view.stage}
      progress={view.progress}
      stages={view.stages}
      illustration={view.illustration}
      source={source}
      connected={connected}
      busy={busy}
      onCancel={onCancel}
    />
  )
}
