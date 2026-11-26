import type { StoryAsset, StoryOptions } from './types'

/** Assets that carry a cleanup result. A missing entry in the asset list must not break the comparison. */
export function cleanupSourceAssets(assets: (StoryAsset | null | undefined)[]): StoryAsset[] {
  return assets.filter((asset): asset is StoryAsset => Boolean(asset?.audio_cleanup))
}

/** Noise reduction stays off where the server cannot run it, so generation is not refused. */
export function withAvailableCleanup(options: StoryOptions, available: boolean): StoryOptions {
  if (available || !options.audio_cleanup?.enabled) return options
  return { ...options, audio_cleanup: { ...options.audio_cleanup, enabled: false } }
}
