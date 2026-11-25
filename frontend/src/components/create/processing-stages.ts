/** Shared stage model for the processing card used by upload and YouTube clip creation. */

export type ProcessingStageState = 'done' | 'current' | 'upcoming' | 'failed'

export interface ProcessingCardStage {
  key: string
  label: string
  state: ProcessingStageState
}

/**
 * How far the pipeline got:
 * - running: stages before `currentIndex` are done, `currentIndex` is in progress;
 * - failed: stages before `currentIndex` are done, `currentIndex` failed;
 * - complete: every stage is done.
 */
export type ProcessingProgressMode = 'running' | 'failed' | 'complete'

/** Builds the per-stage states the stage line draws from a stage index and outcome. */
export function buildStageStates(
  labels: ReadonlyArray<{ key: string; label: string }>,
  currentIndex: number,
  mode: ProcessingProgressMode
): ProcessingCardStage[] {
  return labels.map((stage, index) => {
    let state: ProcessingStageState
    if (mode === 'complete' || index < currentIndex) state = 'done'
    else if (index === currentIndex) state = mode === 'failed' ? 'failed' : 'current'
    else state = 'upcoming'
    return { key: stage.key, label: stage.label, state }
  })
}

/** Clamps a percentage to the 0–100 range the progress bar understands. */
export function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}
