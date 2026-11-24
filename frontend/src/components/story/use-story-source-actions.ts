import { useCallback } from 'react'
import { storyRequest } from './api'
import { storyProblem } from './story-error'
import { validateStoryFiles } from './story-file-validation'
import type { StoryAsset, StoryProject } from './types'
import type { StoryRefresh } from './use-story-project-query'
import { useStoryLanguage } from './use-story-language'
import {
  storyAssetOrderPayload,
  storyNextAssetOrder,
  type StoryUploads
} from './story-workspace-model'

interface StorySourceActionsOptions {
  projectID: string
  refresh: StoryRefresh
  assets: StoryAsset[]
  videos: StoryAsset[]
  pending: { file: File }[]
  sourceIDs: Set<string>
  limits: StoryProject['limits']
  uploads: Pick<StoryUploads, 'add' | 'forget'>
  mutate: (
    path: string,
    method: string,
    payload?: Record<string, unknown>
  ) => Promise<boolean>
  setError: (message: string) => void
}

/** Adds, removes, reorders and renews the footage of a project. */
export function useStorySourceActions({
  projectID,
  refresh,
  assets,
  videos,
  pending,
  sourceIDs,
  limits,
  uploads,
  mutate,
  setError
}: StorySourceActionsOptions) {
  const text = useStoryLanguage()

  function addFiles(files: File[]) {
    const validation = validateStoryFiles(
      files,
      videos,
      pending.map((item) => item.file),
      limits
    )
    if (validation) {
      setError(storyProblem(validation, text))
      return
    }
    setError('')
    uploads.add(files, storyNextAssetOrder(assets))
  }

  async function removeAsset(assetID: string) {
    if (sourceIDs.has(assetID)) {
      if (await mutate(`/assets/${assetID}`, 'DELETE')) uploads.forget(assetID)
    } else uploads.forget(assetID)
  }

  function changeAsset(assetID: string, patch: Partial<StoryAsset>) {
    void mutate('', 'PATCH', {
      assets: storyAssetOrderPayload(assets, assetID, patch)
    })
  }

  /** Signed playback URLs expire; the fresh project carries renewed ones. */
  const renewAsset = useCallback(
    async (assetID: string) => {
      try {
        const fresh = await storyRequest<StoryProject>(
          `/api/stories/${projectID}`,
          'GET'
        )
        await refresh(fresh)
        return fresh.assets?.find((asset) => asset.id === assetID)
      } catch {
        return undefined
      }
    },
    [projectID, refresh]
  )

  return { addFiles, removeAsset, changeAsset, renewAsset }
}
