import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useAudioCleanupAvailability } from '@/hooks/use-audio-cleanup-availability'
import { StoryHelp } from './story-help'
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
      <details
        className="story-disclosure group"
        open={options.narration || undefined}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
          {text('Sound', 'Sunet')}:{' '}
          {options.narration
            ? text('My narration', 'Narațiunea mea')
            : text('Original audio', 'Sunet original')}
          <ChevronDown
            className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div
          className="mt-3 grid gap-2"
          role="group"
          aria-label={text('Clip sound', 'Sunetul clipului')}
        >
          <Button
            type="button"
            className="h-auto min-h-11 whitespace-normal px-3 py-2.5"
            variant={options.narration ? 'outline' : 'default'}
            aria-pressed={!options.narration}
            disabled={hasNarration}
            aria-describedby={hasNarration ? `${id}-voice-note` : undefined}
            onClick={() => change({ narration: false })}
          >
            {text('Sound from my clips', 'Sunetul din filmări')}
          </Button>
          <Button
            type="button"
            className="h-auto min-h-11 whitespace-normal px-3 py-2.5"
            variant={options.narration ? 'default' : 'outline'}
            aria-pressed={Boolean(options.narration)}
            onClick={() => change({ narration: true })}
          >
            {text('My voice over the images', 'Vocea mea peste imagini')}
          </Button>
        </div>
        {hasNarration && (
          <p
            id={`${id}-voice-note`}
            className="mt-3 text-xs text-muted-foreground"
          >
            {text(
              'Remove your voice recording to use the sound from your clips.',
              'Șterge înregistrarea vocală pentru a folosi sunetul filmărilor.'
            )}
          </p>
        )}
      </details>
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
