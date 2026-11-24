import type { StoryOptions } from './types'
import { StorySegmentedControl } from './story-segmented-control'
import { useStoryLanguage } from './use-story-language'

/**
 * Chooses between the clips' own sound and a recorded narration. Switching to the narration
 * turns the noise reduction off, and switching back keeps the music choice intact.
 */
export function StorySoundSource({
  options,
  hasNarration,
  onChange
}: {
  options: StoryOptions
  hasNarration: boolean
  onChange: (options: StoryOptions) => void
}) {
  const text = useStoryLanguage()
  const cleanupAssetIDs = options.audio_cleanup?.asset_ids ?? []
  const selected = options.narration
    ? 'voice'
    : options.music?.source_audio === 'mute'
      ? undefined
      : 'clips'

  function choose(choice: 'clips' | 'voice') {
    if (choice === 'voice') {
      onChange({
        ...options,
        narration: true,
        audio_cleanup: { enabled: false, asset_ids: cleanupAssetIDs }
      })
      return
    }
    onChange({
      ...options,
      narration: false,
      ...(options.music
        ? { music: { ...options.music, source_audio: 'preserve' } }
        : {})
    })
  }

  return (
    <StorySegmentedControl
      label={text('Clip sound', 'Sunetul clipului')}
      value={selected}
      options={[
        {
          value: 'clips',
          label: text('Sound from my clips', 'Sunetul din filmări'),
          disabled: hasNarration
        },
        { value: 'voice', label: text('My voice', 'Vocea mea') }
      ]}
      onChange={choose}
    />
  )
}
