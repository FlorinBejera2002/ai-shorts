import { useState } from 'react'
import type { StoryOptions } from './types'

/**
 * Unsaved option edits on top of the saved project options.
 * Until the user changes something, the saved options are shown as they are refreshed;
 * once edited, the draft stays until it is saved or replaced.
 */
export function useStoryOptionsDraft(saved: StoryOptions) {
  const [draft, setDraft] = useState<StoryOptions | null>(null)
  return [draft ?? saved, setDraft] as const
}
