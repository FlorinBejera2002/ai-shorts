import { useState } from 'react'
import { rememberProject, savedProject } from './story-builder-storage'
import type { StoryStep } from './story-wizard'
import type { StoryProject } from './types'

/** The step the wizard should open on: a finished draft resumes, a stopped one shows its result. */
function savedStep(project: StoryProject, initialStep?: StoryStep): StoryStep {
  if (project.status !== 'draft') return 2
  if (initialStep !== undefined) return initialStep
  const saved = Number(savedProject(`sneepcut:story-step:${project.id}`))
  return saved >= 0 && saved <= 3 && Number.isInteger(saved)
    ? (Math.min(saved, 2) as StoryStep)
    : 0
}

interface StoryWorkspaceStepsOptions {
  project: StoryProject
  initialStep?: StoryStep
  /** Busy, narration or music work is in progress: the stepper is locked. */
  navigationLocked: boolean
  narrationMissing: boolean
  musicProblem: string | null
  optionsChanged: boolean
  isMutating: () => boolean
  saveOptions: () => Promise<boolean>
  setError: (message: string) => void
}

/** Wizard step state; moving to Captions or Generate first saves unsaved choices. */
export function useStoryWorkspaceSteps({
  project,
  initialStep,
  navigationLocked,
  narrationMissing,
  musicProblem,
  optionsChanged,
  isMutating,
  saveOptions,
  setError
}: StoryWorkspaceStepsOptions) {
  const [step, setStep] = useState<StoryStep>(() =>
    savedStep(project, initialStep)
  )
  const [furthest, setFurthest] = useState(step)
  const stepStorageKey = `sneepcut:story-step:${project.id}`

  async function goToStep(next: StoryStep) {
    if (navigationLocked || isMutating() || next === step) return
    if (next === 2 && musicProblem) {
      setError(musicProblem)
      return
    }
    // Keep Brief and Captions reachable while an unsaved choice conflicts with
    // the prompt. Validate the combined request before entering Generate.
    if (next === 2 && optionsChanged && !(await saveOptions())) return
    const destination = next > 1 && narrationMissing ? 1 : next
    setError('')
    setStep(destination)
    setFurthest((previous) => Math.max(previous, destination) as StoryStep)
    rememberProject(stepStorageKey, String(destination))
  }

  return { step, furthest, goToStep }
}
