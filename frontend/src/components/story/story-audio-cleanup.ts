import type { StoryOptions } from './types'

/** Noise reduction stays off where the server cannot run it, so generation is not refused. */
export function withAvailableCleanup(options: StoryOptions, available: boolean): StoryOptions {
  if (available || !options.audio_cleanup?.enabled) return options
  return { ...options, audio_cleanup: { ...options.audio_cleanup, enabled: false } }
}
