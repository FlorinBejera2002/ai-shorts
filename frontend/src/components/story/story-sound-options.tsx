import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { useAudioCleanupAvailability } from '@/hooks/use-audio-cleanup-availability'
import { StoryHelp } from './story-help'
import { StorySoundSource } from './story-sound-source'
import type { StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'

interface Props {
  options: StoryOptions
  hasNarration: boolean
  onChange: (options: StoryOptions) => void
}

export function StorySoundOptions({ options, hasNarration, onChange }: Props) {
  const text = useStoryLanguage()
  const id = useId()
  const cleanup = useAudioCleanupAvailability()
  const audio = useTranslations('audioCleanup')
  const change = (patch: Partial<StoryOptions>) =>
    onChange({ ...options, ...patch })
  return (
    <div className="space-y-4">
      <StorySoundSource options={options} hasNarration={hasNarration} onChange={onChange} />
      <div className="flex items-start gap-3 text-sm">
        <label className="flex flex-1 items-start gap-3">
          <input
            type="checkbox"
            aria-label={text(
              'Reduce background noise',
              'Redu zgomotul de fundal'
            )}
            className="mt-1 size-4 accent-foreground"
            checked={Boolean(options.audio_cleanup?.enabled)}
            disabled={!cleanup.available && !options.audio_cleanup?.enabled}
            aria-describedby={`${id}-noise-availability`}
            onChange={(event) => {
              if (!event.target.checked || cleanup.available)
                change({ audio_cleanup: { enabled: event.target.checked } })
            }}
          />
          <span>
            <span className="block font-medium">
              {text('Reduce background noise', 'Redu zgomotul de fundal')}
            </span>
            <span
              id={`${id}-noise-availability`}
              className="mt-1 block text-xs text-muted-foreground"
            >
              {!cleanup.available
                ? audio(
                    cleanup.loading
                      ? 'checkingAvailability'
                      : options.audio_cleanup?.enabled
                        ? 'unavailableSelected'
                        : 'unavailableOption'
                  )
                : null}
            </span>
          </span>
        </label>
        <StoryHelp
          label={text('About noise reduction', 'Despre reducerea zgomotului')}
        >
          {text(
            'For speech recordings. Keep this off for music or atmosphere you want to preserve. Other voices and strong echo may remain.',
            'Pentru înregistrări vorbite. Lasă opțiunea oprită pentru muzică sau ambianța pe care vrei să o păstrezi. Alte voci și ecoul puternic pot rămâne.'
          )}
        </StoryHelp>
      </div>
    </div>
  )
}
