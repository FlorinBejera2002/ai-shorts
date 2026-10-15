import type { StoryProject } from './types'

/** Completed videos are edited in Studio; only initial generation retries here. */
export function storyRetryPayload(
  project: Pick<StoryProject, 'assets' | 'current_version'>
): Record<string, unknown> | undefined {
  if (project.current_version === 0)
    return { asset_ids: project.assets.map((asset) => asset.id) }
}
