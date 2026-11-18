import { useId } from 'react'
import type { StoryMusicOptions } from './types'
import { useStoryLanguage } from './use-story-language'

export function StoryMusicSourceAudio({
  value,
  onChange
}: {
  value: StoryMusicOptions
  onChange: (music: StoryMusicOptions) => void
}) {
  const text = useStoryLanguage()
  const id = useId()
  const choices = [
    {
      value: 'preserve',
      label: text('Keep original sound', 'Păstrează sunetul original'),
      detail: text(
        'Keep dialogue and clip sound alongside the music.',
        'Păstrează dialogul și sunetul filmărilor alături de muzică.'
      )
    },
    {
      value: 'mute',
      label: text('Music only', 'Doar muzică'),
      detail: text(
        'Mute all original clip sound, including dialogue. Keep complete visual actions.',
        'Oprește tot sunetul original, inclusiv dialogul. Păstrează acțiunile vizuale complete.'
      )
    }
  ] as const
  return (
    <fieldset className="min-w-0 space-y-2" data-testid="music-source-audio">
      <legend className="mb-2 text-sm font-medium">
        {text('Original clip sound', 'Sunetul filmărilor')}
      </legend>
      {choices.map((choice) => (
        <label
          key={choice.value}
          className="flex cursor-pointer items-start gap-2 text-sm"
        >
          <input
            type="radio"
            name={`${id}-source-audio`}
            value={choice.value}
            aria-label={choice.label}
            checked={(value.source_audio ?? 'preserve') === choice.value}
            onChange={() => onChange({ ...value, source_audio: choice.value })}
            aria-describedby={`${id}-${choice.value}-note`}
            className="mt-0.5 size-4 shrink-0 accent-foreground"
          />
          <span className="min-w-0 space-y-1">
            <span className="block">{choice.label}</span>
            <span
              id={`${id}-${choice.value}-note`}
              className="block text-xs leading-relaxed text-muted-foreground"
            >
              {choice.detail}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
