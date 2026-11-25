'use client'

import { useStoryLanguage } from './use-story-language'
import { storyFailureReason } from './story-error'
import { uploadProcessingView } from './story-processing-model'
import { uploadStageLabels } from './story-processing-copy'
import { StoryRunningCard, StoryStoppedCard } from './story-processing-states'
import type { StoryProject } from './types'

interface Props {
  project: StoryProject
  active: boolean
  busy: boolean
  onCancel: () => void
  onRetry?: () => void
}

/** Upload processing card: five stages, a progress value and the single cancel action. */
export function StoryProcessing({ project, active, busy, onCancel, onRetry }: Props) {
  const text = useStoryLanguage()
  const failed = project.status === 'failed' || project.operation_status === 'failed'
  const cancelled = !failed && project.status === 'cancelled'
  const view = uploadProcessingView(uploadStageLabels(text), project, failed)

  if (failed || cancelled) {
    return (
      <StoryStoppedCard
        failed={failed}
        failureReason={storyFailureReason(project)}
        progress={view.progress}
        stages={view.stages}
        busy={busy}
        onRetry={onRetry}
        text={text}
      />
    )
  }

  return (
    <StoryRunningCard
      stage={view.stage}
      progress={view.progress}
      stages={view.stages}
      illustration={view.illustration}
      active={active}
      cancelDisabled={busy || project.status === 'cancelling'}
      onCancel={onCancel}
      text={text}
    />
  )
}
