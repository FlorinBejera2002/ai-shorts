import type { StoryAsset, StoryOptions, StoryProject, StoryVersion } from './types'
import { canEditStorySources } from './types'

interface StoryGenerationOptions {
  project: StoryProject
  options: StoryOptions
  setOptions: (options: StoryOptions) => void
  assets: StoryAsset[]
  version: StoryVersion | undefined
  canCreate: boolean
  mutate: (
    path: string,
    method: string,
    payload?: Record<string, unknown>
  ) => Promise<boolean>
}

/** Saves the options and starts generation, or applies a choice the server needs first. */
export function useStoryGeneration({
  project,
  options,
  setOptions,
  assets,
  version,
  canCreate,
  mutate
}: StoryGenerationOptions) {
  const assetIDs = () => assets.map((asset) => asset.id)

  async function generate() {
    if (!canCreate) return
    if (canEditStorySources(project) && !(await mutate('', 'PATCH', { options })))
      return
    await mutate('/generate', 'POST', { asset_ids: assetIDs() })
  }

  async function continueWithOriginalAudio() {
    if (version) return
    const original = { ...options, audio_cleanup: { enabled: false } }
    if (await mutate('', 'PATCH', { options: original })) {
      setOptions(original)
      await mutate('/generate', 'POST', { asset_ids: assetIDs() })
    }
  }

  /** Changing narration on or off reshapes the wizard, so it is saved before the change shows. */
  function changeOptions(value: StoryOptions) {
    if (Boolean(value.narration) !== Boolean(options.narration)) {
      void mutate('', 'PATCH', { options: value }).then((saved) => {
        if (saved) setOptions(value)
      })
    } else setOptions(value)
  }

  return { generate, continueWithOriginalAudio, changeOptions }
}
