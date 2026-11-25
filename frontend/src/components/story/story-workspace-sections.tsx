import type { ComponentProps, ReactNode } from 'react'
import { StoryCreateReview } from './story-create-review'
import { StoryErrorAlert } from './story-error-alert'
import { StoryMusicRecovery } from './story-music-recovery'
import { StoryProjectDelete, StoryProjectStatus } from './story-project-controls'
import { StoryResult } from './story-result'
import { StoryTranscriptReview } from './story-transcript-review'
import { StoryWizard, type StoryStep } from './story-wizard'
import type {
  StoryAsset,
  StoryProject,
  StoryTranscriptApproval,
  StoryVersion
} from './types'
import { useStoryLanguage } from './use-story-language'

interface StoryWorkspaceStatusPanelProps {
  project: StoryProject
  active: boolean
  busy: boolean
  mediaPending: boolean
  error: string
  showMusicRecovery: boolean
  optionsChanged: boolean
  retryOperation?: () => void
  onCancel: () => void
  onOpenMusicSettings: () => void
}

/** Run status, the music analysis recovery card and the last error, above the workspace. */
export function StoryWorkspaceStatusPanel({
  project,
  active,
  busy,
  mediaPending,
  error,
  showMusicRecovery,
  optionsChanged,
  retryOperation,
  onCancel,
  onOpenMusicSettings
}: StoryWorkspaceStatusPanelProps) {
  return (
    <>
      <StoryProjectStatus
        project={project}
        active={active}
        busy={busy}
        onRetry={retryOperation}
        onCancel={onCancel}
      />
      {showMusicRecovery && (
        <StoryMusicRecovery
          disabled={busy || mediaPending}
          onRetry={optionsChanged ? undefined : retryOperation}
          onSettings={onOpenMusicSettings}
        />
      )}
      {error && <StoryErrorAlert message={error} />}
    </>
  )
}

interface StoryWorkspaceResultProps {
  project: StoryProject
  version: StoryVersion | undefined
  active: boolean
  busy: boolean
  mediaPending: boolean
  onDelete: () => Promise<void>
}

/** The saved result of the current version, with delete while the project is idle. */
export function StoryWorkspaceResult({
  project,
  version,
  active,
  busy,
  mediaPending,
  onDelete
}: StoryWorkspaceResultProps) {
  if (!version) return null
  return (
    <StoryResult
      project={project}
      version={version}
      deleteControl={
        active ? undefined : (
          <StoryProjectDelete
            disabled={busy || mediaPending}
            onDelete={onDelete}
          />
        )
      }
    />
  )
}

interface StoryWorkspaceWizardProps {
  visible: boolean
  step: StoryStep
  furthest: StoryStep
  navigationLocked: boolean
  continueDisabled: boolean
  navigationHint: string | undefined
  onStep: (step: StoryStep) => void
  onContinue: () => void
  sourcesPanel: ReactNode
  optionsPanel: ReactNode
  review: ComponentProps<typeof StoryCreateReview>
}

/** The three-step editor: sources, options, then review and create. */
export function StoryWorkspaceWizard({
  visible,
  step,
  furthest,
  navigationLocked,
  continueDisabled,
  navigationHint,
  onStep,
  onContinue,
  sourcesPanel,
  optionsPanel,
  review
}: StoryWorkspaceWizardProps) {
  if (!visible) return null
  return (
    <StoryWizard
      step={step}
      furthest={furthest}
      onStep={onStep}
      onContinue={onContinue}
      navigationDisabled={navigationLocked}
      continueDisabled={continueDisabled}
      navigationHint={navigationHint}
    >
      <div
        className="story-step-panel"
        hidden={step !== 0}
        data-testid="story-step-0"
      >
        {sourcesPanel}
      </div>
      <div
        hidden={step !== 1}
        data-testid="story-step-1"
        className="story-step-panel"
      >
        {optionsPanel}
      </div>
      <div
        className="story-step-panel"
        hidden={step !== 2}
        data-testid="story-step-2"
      >
        <StoryCreateReview {...review} />
      </div>
    </StoryWizard>
  )
}

/** Collapsed transcript review, shown only for an idle project whose assets have transcript passages. */
export function StoryTranscriptDisclosure({
  assets,
  disabled,
  onApprove,
  onRenew
}: {
  assets: StoryAsset[]
  disabled: boolean
  onApprove: (reviews: StoryTranscriptApproval[]) => Promise<boolean | undefined>
  onRenew: (assetID: string) => Promise<StoryAsset | undefined>
}) {
  const text = useStoryLanguage()
  if (!assets.some((asset) => asset.transcript_proposals?.length)) return null
  return (
    <details
      className="story-transcript-disclosure border-t"
      data-testid="story-transcript-disclosure"
    >
      <summary className="cursor-pointer py-3 text-sm font-medium">
        {text('Review transcripts', 'Verifică transcrierile')}
      </summary>
      <StoryTranscriptReview
        assets={assets}
        disabled={disabled}
        onApprove={onApprove}
        onRenew={onRenew}
      />
    </details>
  )
}
