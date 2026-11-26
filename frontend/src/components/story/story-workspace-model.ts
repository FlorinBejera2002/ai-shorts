import type { StoryStep } from './story-wizard'
import { canEditStorySources, storyOptionsEqual, type StoryAsset, type StoryOptions, type StoryProject, type StoryVersion } from './types'
import type { PendingUpload, useStoryUploads } from './use-story-uploads'

export type StoryText = (english: string, romanian: string, spanish?: string) => string
export type StoryUploads = ReturnType<typeof useStoryUploads>

const MUSIC_ANALYSIS_FAILURE = /music analysis|music.*analy[sz]/i

export function storyVersionFor(project: StoryProject): StoryVersion | undefined {
  return project.versions?.find((item) => item.number === project.current_version)
}

/** A run that failed or was cancelled, either at project or operation level. */
export function storyFailedOperation(project: StoryProject) {
  return (
    project.status === 'failed' ||
    project.status === 'cancelled' ||
    project.operation_status === 'failed'
  )
}

/** A stopped run without a saved result shows only its status card, not the wizard. */
export function storyStoppedWithoutResult(
  project: StoryProject,
  version: StoryVersion | undefined
) {
  return !version && storyFailedOperation(project)
}

export function storyShowsWizard({
  version,
  active,
  stoppedWithoutResult,
  reviewingSettings
}: {
  version: StoryVersion | undefined
  active: boolean
  stoppedWithoutResult: boolean
  reviewingSettings: boolean
}) {
  return !version && !active && (!stoppedWithoutResult || reviewingSettings)
}

export function storyShowsMusicRecovery({
  project,
  options,
  active,
  version,
  failedOperation
}: {
  project: StoryProject
  options: StoryOptions
  active: boolean
  version: StoryVersion | undefined
  failedOperation: boolean
}) {
  return (
    !version &&
    !active &&
    failedOperation &&
    Boolean(options.music?.sync) &&
    MUSIC_ANALYSIS_FAILURE.test(project.error ?? '')
  )
}

export function storySourceIDs(assets: StoryAsset[]) {
  return new Set(assets.map((asset) => asset.id))
}

export function storyPendingUploads(
  items: PendingUpload[],
  sourceIDs: Set<string>
) {
  return items.filter(
    (item) => !sourceIDs.has(item.id) && item.status !== 'complete'
  )
}

export function storyNextAssetOrder(assets: StoryAsset[]) {
  return assets.reduce((order, asset) => Math.max(order, asset.order), -1) + 1
}

/** The full source order after one asset changes, as the server expects it. */
export function storyAssetOrderPayload(
  assets: StoryAsset[],
  assetID: string,
  patch: Partial<StoryAsset>
) {
  const ordered = [...assets].sort((a, b) => a.order - b.order)
  if (patch.order !== undefined) {
    const index = ordered.findIndex((asset) => asset.id === assetID)
    const [moved] = ordered.splice(index, 1)
    if (moved) ordered.splice(patch.order, 0, moved)
  }
  return ordered.map((asset, index) => ({
    id: asset.id,
    role: asset.id === assetID ? (patch.role ?? asset.role) : asset.role,
    include:
      asset.id === assetID ? (patch.include ?? asset.include) : asset.include,
    order: index
  }))
}

export function storyCanCreate({
  pendingCount,
  mediaPending,
  musicProblem,
  videos,
  options,
  narration
}: {
  pendingCount: number
  mediaPending: boolean
  musicProblem: string | null
  videos: StoryAsset[]
  options: StoryOptions
  narration: StoryAsset | undefined
}) {
  return (
    pendingCount === 0 &&
    !mediaPending &&
    !musicProblem &&
    videos.some((asset) => asset.include !== 'excluded') &&
    (!options.narration || Boolean(narration))
  )
}

/** Explains why the wizard cannot advance, in the active language. */
export function stepHint(
  text: StoryText,
  step: StoryStep,
  narrationMissing: boolean,
  uploading: boolean
) {
  if (step === 1 && narrationMissing)
    return text(
      'Record or choose an audio file, then save your narration to continue.',
      'Înregistrează sau alege un fișier audio, apoi salvează narațiunea pentru a continua.'
    )
  if (uploading && step !== 0)
    return text(
      'Your clips are still uploading. You can keep preparing your video.',
      'Filmările încă se încarcă. Poți continua să pregătești clipul.'
    )
}

export function storyNavigationHint({
  text,
  musicPending,
  musicProblem,
  step,
  narrationMissing,
  uploading
}: {
  text: StoryText
  musicPending: boolean
  musicProblem: string | null
  step: StoryStep
  narrationMissing: boolean
  uploading: boolean
}) {
  if (musicPending)
    return text(
      'Finish or cancel the music upload to continue.',
      'Finalizează sau anulează încărcarea muzicii pentru a continua.'
    )
  return musicProblem || stepHint(text, step, narrationMissing, uploading)
}

/** Locks and edit permissions of the workspace, derived from the project and in-flight work. */
export function storyWorkspaceLocks({
  project,
  options,
  narration,
  musicProblem,
  uploadsBusy,
  busy,
  narrationPending,
  musicPending
}: {
  project: StoryProject
  options: StoryOptions
  narration: StoryAsset | undefined
  musicProblem: string | null
  uploadsBusy: boolean
  busy: boolean
  narrationPending: boolean
  musicPending: boolean
}) {
  const editable = canEditStorySources(project)
  const narrationMissing = Boolean(options.narration && !narration)
  return {
    mediaPending: uploadsBusy || narrationPending || musicPending,
    navigationLocked: busy || narrationPending || musicPending,
    optionsChanged: editable && !storyOptionsEqual(options, project.options),
    canEditSources: editable && !busy,
    narrationMissing,
    blocksContinue: narrationMissing || Boolean(musicProblem)
  }
}

/** Saved narration and the footage list, split from the project assets. */
export function storyWorkspaceAssets(project: StoryProject) {
  const assets = project.assets ?? []
  return {
    assets,
    narration: assets.find((asset) => asset.kind === 'narration'),
    videos: assets.filter((asset) => asset.kind !== 'narration')
  }
}
