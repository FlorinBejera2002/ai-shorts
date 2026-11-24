import { useState } from 'react'
import { StoryAudioComparison } from './story-audio-comparison'
import { StoryNarration } from './story-narration'
import { StoryOptionsPanel } from './story-options'
import { StorySources } from './story-sources'
import type { RejectedSource } from './story-source-model'
import { storyRetryPayload } from './story-retry'
import type { StoryStep } from './story-wizard'
import { musicRangeProblem } from './story-music-model'
import {
  storyCanCreate,
  storyFailedOperation,
  storyNavigationHint,
  storyPendingUploads,
  storyShowsMusicRecovery,
  storyShowsWizard,
  storySourceIDs,
  storyStoppedWithoutResult,
  storyVersionFor,
  storyWorkspaceAssets,
  storyWorkspaceLocks
} from './story-workspace-model'
import {
  StoryTranscriptDisclosure,
  StoryWorkspaceResult,
  StoryWorkspaceStatusPanel,
  StoryWorkspaceWizard
} from './story-workspace-sections'
import {
  defaultLimits,
  storyIsBusy,
  type StoryProject,
  type StoryTranscriptApproval
} from './types'
import { useStoryGeneration } from './use-story-generation'
import { useStoryMutation } from './use-story-mutation'
import { useStoryOptionsDraft } from './use-story-options-draft'
import { useStorySourceActions } from './use-story-source-actions'
import { useStoryLanguage } from './use-story-language'
import { useStoryUploads } from './use-story-uploads'
import { useStoryWorkspaceEffects } from './use-story-workspace-effects'
import { useStoryWorkspaceSteps } from './use-story-workspace-steps'
import type { StoryRefresh } from './use-story-project-query'

interface StoryWorkspaceProps {
  project: StoryProject
  refused: RejectedSource[]
  onRefusedChange: (update: (current: RejectedSource[]) => RejectedSource[]) => void
  initialFiles: File[]
  initialStep?: StoryStep
  refresh: StoryRefresh
  onUploadBusy: (busy: boolean) => void
  onUnsavedChanges: (unsaved: boolean) => void
  onDeleted: () => void
}

/** Editor for one project: sources, options, review and the saved result. */
export function StoryWorkspace({
  project,
  refused,
  onRefusedChange,
  initialFiles,
  initialStep,
  refresh,
  onUploadBusy,
  onUnsavedChanges,
  onDeleted
}: StoryWorkspaceProps) {
  const text = useStoryLanguage()
  const uploads = useStoryUploads(project.id, refresh)
  const { busy, error, setError, mutate, isMutating } = useStoryMutation(
    project.id,
    refresh
  )
  const [options, setOptions] = useStoryOptionsDraft(project.options)
  const [narrationPending, setNarrationPending] = useState(false)
  const [musicPending, setMusicPending] = useState(false)
  // Set when the music recovery card opens the settings, so the wizard can show the failed run's options.
  const [reviewingSettings, setReviewingSettings] = useState(false)

  const { assets, narration, videos } = storyWorkspaceAssets(project)
  const sourceIDs = storySourceIDs(assets)
  const pending = storyPendingUploads(uploads.items, sourceIDs)
  const version = storyVersionFor(project)
  const active = storyIsBusy(project.status)
  const failedOperation = storyFailedOperation(project)
  const stoppedWithoutResult = storyStoppedWithoutResult(project, version)
  const limits = project.limits ?? defaultLimits
  const musicProblem = musicRangeProblem(options.music, text)
  const { mediaPending, navigationLocked, optionsChanged, canEditSources, narrationMissing, blocksContinue } =
    storyWorkspaceLocks({
      project,
      options,
      narration,
      musicProblem,
      uploadsBusy: uploads.busy,
      busy,
      narrationPending,
      musicPending
    })
  const canCreate = storyCanCreate({
    pendingCount: pending.length,
    mediaPending,
    musicProblem,
    videos,
    options,
    narration
  })
  const retryPayload = failedOperation ? storyRetryPayload(project) : undefined
  const retryOperation = retryPayload
    ? () => void mutate('/retry', 'POST', retryPayload)
    : undefined

  const steps = useStoryWorkspaceSteps({
    project,
    initialStep,
    navigationLocked,
    narrationMissing,
    musicProblem,
    optionsChanged,
    isMutating,
    saveOptions: () => mutate('', 'PATCH', { options }),
    setError
  })
  const sources = useStorySourceActions({
    projectID: project.id,
    refresh,
    assets,
    videos,
    pending,
    sourceIDs,
    limits,
    uploads,
    mutate,
    setError
  })
  const generation = useStoryGeneration({
    project,
    options,
    setOptions,
    assets,
    version,
    canCreate,
    mutate
  })
  useStoryWorkspaceEffects({
    initialFiles,
    addUploads: uploads.add,
    mediaPending,
    busy,
    optionsChanged,
    onUploadBusy,
    onUnsavedChanges
  })

  async function deleteProject() {
    if (await mutate('', 'DELETE')) onDeleted()
  }

  function approveTranscripts(reviews: StoryTranscriptApproval[]) {
    return mutate('/transcript-review', 'POST', {
      version: project.current_version,
      expected_state: project.expected_state,
      reviews
    })
  }

  const showWizard = storyShowsWizard({
    version,
    active,
    stoppedWithoutResult,
    reviewingSettings
  })
  const sourcesPanel = (
    <StorySources
      assets={videos}
      uploads={uploads.items}
      limits={limits}
      disabled={!canEditSources || narrationPending}
      onAdd={sources.addFiles}
      onRemove={(assetID) => void sources.removeAsset(assetID)}
      onRetry={uploads.retry}
      onDuration={(assetID, duration) => uploads.update(assetID, { duration })}
      onChange={sources.changeAsset}
      refused={refused}
      onRefusedChange={onRefusedChange}
    />
  )
  const narrationPanel = (options.narration || narration) && (
    <StoryNarration
      projectID={project.id}
      asset={narration}
      disabled={!canEditSources}
      onSaved={refresh}
      onPending={setNarrationPending}
      onRemove={(assetID) => void sources.removeAsset(assetID)}
    />
  )
  const optionsPanel = (
    <StoryOptionsPanel
      active={steps.step === 1}
      options={options}
      footage={videos}
      hasNarration={Boolean(narration)}
      disabled={!canEditSources}
      onChange={generation.changeOptions}
      narration={narrationPanel}
      onMusicPending={setMusicPending}
    />
  )

  return (
    <div className="space-y-5">
      <StoryWorkspaceStatusPanel
        project={project}
        active={active}
        busy={busy}
        mediaPending={mediaPending}
        error={error}
        showMusicRecovery={storyShowsMusicRecovery({
          project,
          options,
          active,
          version,
          failedOperation
        })}
        optionsChanged={optionsChanged}
        retryOperation={retryOperation}
        onCancel={() => void mutate('/cancel', 'POST', {})}
        onOpenMusicSettings={() => {
          setReviewingSettings(true)
          void steps.goToStep(1)
        }}
      />
      <StoryWorkspaceResult
        project={project}
        version={version}
        active={active}
        busy={busy}
        mediaPending={mediaPending}
        onDelete={deleteProject}
      />
      {!version && (
        <StoryAudioComparison
          assets={assets}
          enabled={Boolean(project.options.audio_cleanup?.enabled)}
          disabled={active || busy}
          onOriginal={() => void generation.continueWithOriginalAudio()}
          onRetry={retryOperation}
        />
      )}
      <StoryWorkspaceWizard
        visible={showWizard}
        step={steps.step}
        furthest={steps.furthest}
        navigationLocked={navigationLocked}
        continueDisabled={steps.step === 1 && blocksContinue}
        navigationHint={storyNavigationHint({
          text,
          musicPending,
          musicProblem,
          step: steps.step,
          narrationMissing,
          uploading: uploads.busy
        })}
        onStep={(next) => void steps.goToStep(next)}
        onContinue={() =>
          void steps.goToStep(Math.min(steps.step + 1, 2) as StoryStep)
        }
        sourcesPanel={sourcesPanel}
        optionsPanel={optionsPanel}
        review={{
          options,
          videos,
          narration,
          ready: canCreate,
          busy: navigationLocked,
          pendingCount: pending.length,
          onEdit: (next) => void steps.goToStep(next),
          onCreate: () => void generation.generate(),
          onBack: () => void steps.goToStep(1)
        }}
      />
      {!version && !active && (
        <StoryTranscriptDisclosure
          assets={assets}
          disabled={busy}
          onApprove={approveTranscripts}
          onRenew={sources.renewAsset}
        />
      )}
    </div>
  )
}
