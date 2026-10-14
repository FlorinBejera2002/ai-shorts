import type { StoryProject } from './types'

export interface StoryEditPayload {
  action: string
  version: number
  block_id?: string
  candidate_id?: string
  expected_state?: string
  style?: Record<string, unknown>
}

export interface StoryOperation {
  action: string
  version: number
  payload: StoryEditPayload
}

/** Never guess a different edit when the failed operation is unavailable. */
export function storyRetryPayload(
  project: Pick<StoryProject, 'assets' | 'current_version' | 'expected_state'>,
  operation?: StoryOperation
): Record<string, unknown> | undefined {
  if (project.current_version === 0)
    return { asset_ids: project.assets.map((asset) => asset.id) }
  if (!operation || operation.version !== project.current_version) return undefined
  if (operation.payload.action === 'restyle' && !project.expected_state) return undefined
  return {
    ...operation.payload,
    ...(project.expected_state ? { expected_state: project.expected_state } : {})
  }
}