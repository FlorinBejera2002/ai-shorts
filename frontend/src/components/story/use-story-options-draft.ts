import { useState } from 'react'
import { useAudioCleanupAvailability } from '@/hooks/use-audio-cleanup-availability'
import { withAvailableCleanup } from './story-audio-cleanup'
import type { StoryOptions } from './types'

/**
 * Unsaved option edits on top of the saved project options.
 * Until the user changes something, the saved options are shown as they are refreshed;
 * once edited, the draft stays until it is saved or replaced.
 */
export function useStoryOptionsDraft(saved: StoryOptions) {
  const cleanup = useAudioCleanupAvailability()
  const [draft, setDraft] = useState<StoryOptions | null>(null)
  const options = draft ?? saved
  return [cleanup.loading ? options : withAvailableCleanup(options, cleanup.available), setDraft] as const
}
