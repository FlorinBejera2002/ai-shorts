'use client'

import { ProcessingCard } from '@/components/create/processing-card'
import type { ProcessingCardStage } from '@/components/create/processing-stages'
import { Button } from '@/components/ui/button'
import { storyProblem } from './story-error'
import type { AnalysisCount } from './story-processing-model'
import { uploadStageIllustrationAlt, uploadStageTitle } from './story-processing-copy'

type Text = (english: string, romanian: string) => string

interface RunningCardProps {
  stage: number
  progress: number
  stages: ProcessingCardStage[]
  illustration: string
  /** Sources analyzed so far; shown as "Clip n of m" when there is more than one. */
  analysis?: AnalysisCount
  active: boolean
  cancelDisabled: boolean
  onCancel: () => void
  text: Text
}

/** "Clip 2 of 5" for the source being analyzed; undefined for a single source. */
function analysisDetail(analysis: AnalysisCount | undefined, text: Text) {
  if (!analysis || analysis.total < 2) return undefined
  const current = Math.min(analysis.done + 1, analysis.total)
  return text(`Clip ${current} of ${analysis.total}`, `Clipul ${current} din ${analysis.total}`)
}

/** Upload card while the pipeline runs: one stage title, illustration, progress and the cancel action. */
export function StoryRunningCard({ stage, progress, stages, illustration, analysis, active, cancelDisabled, onCancel, text }: RunningCardProps) {
  return (
    <ProcessingCard
      testID="story-processing"
      title={uploadStageTitle(stage, text)}
      detail={analysisDetail(analysis, text)}
      illustration={{ src: `/illustrations/${illustration}.webp`, alt: uploadStageIllustrationAlt(stage, text) }}
      progress={progress}
      progressLabel={text('Processing progress', 'Progresul procesării')}
      stages={stages}
      stagesLabel={text('Processing steps', 'Etapele procesării')}
      animated={active}
    >
      {active && (
        <Button variant="outline" className="rounded-full" disabled={cancelDisabled} onClick={onCancel}>
          {text('Cancel processing', 'Anulează procesarea')}
        </Button>
      )}
    </ProcessingCard>
  )
}

interface StoppedCardProps {
  failed: boolean
  failureReason?: string | null
  progress: number
  stages: ProcessingCardStage[]
  busy: boolean
  onRetry?: () => void
  text: Text
}

/** Upload card for a failed or cancelled project; failures list the stage and offer a retry. */
export function StoryStoppedCard({ failed, failureReason, progress, stages, busy, onRetry, text }: StoppedCardProps) {
  return (
    <ProcessingCard
      testID="story-processing"
      role={failed ? 'alert' : 'status'}
      title={failed ? text('Processing failed', 'Procesarea a eșuat') : text('Processing stopped', 'Procesarea s-a oprit')}
      detail={failed && failureReason ? storyProblem(failureReason, text) : undefined}
      illustration={{
        src: '/illustrations/create-failed.webp',
        alt: text('Ana and Radu try to repair a projector', 'Ana și Radu încearcă să repună în funcțiune un proiector')
      }}
      progress={progress}
      progressLabel={text('Processing progress', 'Progresul procesării')}
      stages={failed ? stages : undefined}
      stagesLabel={text('Processing steps', 'Etapele procesării')}
      animated={false}
    >
      {failed && onRetry && (
        <Button disabled={busy} className="rounded-full" onClick={onRetry}>
          {text('Try again', 'Încearcă din nou')}
        </Button>
      )}
    </ProcessingCard>
  )
}
