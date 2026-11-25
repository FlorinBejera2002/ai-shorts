import type { ProcessingCardStage } from '@/components/create/processing-stages'
import { buildStageStates } from '@/components/create/processing-stages'
import type { StoryProject } from './types'

/** Upload pipeline checkpoints, in the order the five stages of the processing card show them. */
export const UPLOAD_STAGE_KEYS = ['upload', 'analysis', 'moments', 'edit', 'check'] as const
export type UploadStageIndex = 0 | 1 | 2 | 3 | 4

const checkpointStage: Record<string, UploadStageIndex> = {
  pending: 0,
  queued: 0,
  analyzing: 1,
  music_analysis: 1,
  building_story: 2,
  editing: 3,
  rendering: 3,
  improving: 3,
  reviewing: 4,
  needs_review: 4,
  ready: 4
}

const stageProgress: Record<UploadStageIndex, number> = {
  0: 12,
  1: 34,
  2: 58,
  3: 78,
  4: 94
}

const stageIllustration: Record<UploadStageIndex, string> = {
  0: 'process-upload',
  1: 'process-analysis',
  2: 'process-moments',
  3: 'process-edit',
  4: 'process-check'
}

/** Phase the card reads: the project status, refined by the running checkpoint when present. */
export function uploadPhase(project: Pick<StoryProject, 'status' | 'stage'>) {
  if (project.status === 'queued') return 'pending'
  if (project.status === 'rendering') return 'editing'
  if (project.status === 'processing' && project.stage) return project.stage
  return project.status
}

/** Stage index for a phase, or undefined when the phase is not a processing checkpoint. */
export function uploadStageIndex(phase: string): UploadStageIndex | undefined {
  return checkpointStage[phase]
}

/** Stage the failure happened in; falls back to the first stage when the server did not report one. */
export function uploadFailedStage(project: Pick<StoryProject, 'status' | 'stage'>): UploadStageIndex {
  return uploadStageIndex(uploadPhase(project)) ?? uploadStageIndex(project.stage ?? '') ?? 0
}

export interface UploadProcessingView {
  stage: UploadStageIndex
  progress: number
  illustration: string
  stages: ProcessingCardStage[]
}

/** Maps a running or failed upload project onto the five-stage card model. */
export function uploadProcessingView(
  labels: ReadonlyArray<{ key: string; label: string }>,
  project: Pick<StoryProject, 'status' | 'stage'>,
  failed: boolean
): UploadProcessingView {
  const phase = uploadPhase(project)
  const stage = failed ? uploadFailedStage(project) : (uploadStageIndex(phase) ?? 0)
  return {
    stage,
    progress: stageProgress[stage],
    illustration: stageIllustration[stage],
    stages: buildStageStates(labels, stage, failed ? 'failed' : 'running')
  }
}
