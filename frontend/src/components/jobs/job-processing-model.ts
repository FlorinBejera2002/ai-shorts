import type { ProcessingCardStage } from '@/components/create/processing-stages'
import { buildStageStates, clampProgress } from '@/components/create/processing-stages'

/** YouTube job pipeline stages shown by the card, in order. */
export const JOB_STAGE_KEYS = ['download', 'transcribe', 'analyze', 'edit', 'done'] as const
export type JobStageIndex = 0 | 1 | 2 | 3 | 4

const statusStage: Record<string, JobStageIndex> = {
  pending: 0,
  downloading: 0,
  transcribing: 1,
  analyzing: 2,
  clipping: 3,
  rendering: 3,
  completed: 4
}

/**
 * Failed and cancelled jobs do not report the step they stopped in, so the stage
 * is inferred from the last progress value with the backend's step thresholds.
 */
export function stageFromProgress(progress: number): JobStageIndex {
  const value = clampProgress(progress)
  if (value < 20) return 0
  if (value < 50) return 1
  if (value < 56) return 2
  return 3
}

export function isDurationExceeded(errorMessage?: string | null) {
  return /video duration\s+[\d.]+s exceeds max\s+\d+s/i.test(errorMessage ?? '')
}

/** Minutes of the video and of the allowed maximum, from the backend duration error. */
export function durationLimit(errorMessage?: string | null) {
  const match = errorMessage?.match(/video duration\s+([\d.]+)s exceeds max\s+(\d+)s/i)
  if (!match) return null
  return {
    actualMinutes: Math.ceil(Number(match[1]) / 60),
    maxMinutes: Math.floor(Number(match[2]) / 60)
  }
}

export interface JobProcessingView {
  stage: JobStageIndex
  progress: number
  illustration: string
  stages: ProcessingCardStage[]
  mode: 'running' | 'failed' | 'complete'
}

const illustrations: Record<JobStageIndex, string> = {
  0: 'create-youtube-download',
  1: 'youtube-transcribe',
  2: 'process-analysis',
  3: 'process-edit',
  4: 'create-done'
}

/** Maps a job status onto the five-stage card model. */
export function jobProcessingView(
  labels: ReadonlyArray<{ key: string; label: string }>,
  status: string,
  progress: number
): JobProcessingView {
  if (status === 'completed') {
    return {
      stage: 4,
      progress: 100,
      illustration: illustrations[4],
      stages: buildStageStates(labels, 4, 'complete'),
      mode: 'complete'
    }
  }
  if (status === 'failed' || status === 'cancelled') {
    const stage = stageFromProgress(progress)
    return {
      stage,
      progress: clampProgress(progress),
      illustration: illustrations[stage],
      stages: buildStageStates(labels, stage, status === 'failed' ? 'failed' : 'running'),
      mode: 'failed'
    }
  }
  const stage = statusStage[status] ?? 0
  return {
    stage,
    progress: clampProgress(progress),
    illustration: illustrations[stage],
    stages: buildStageStates(labels, stage, 'running'),
    mode: 'running'
  }
}
