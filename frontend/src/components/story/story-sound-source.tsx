import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'

export function StorySoundSource({ options, hasNarration, onChange }: {
  options: StoryOptions
  hasNarration: boolean
  onChange: (options: StoryOptions) => void
}) {
  const text = useStoryLanguage()
  const id = useId()
  const change = (patch: Partial<StoryOptions>) => onChange({ ...options, ...patch })
  return (
      <details
        className="story-disclosure group"
        open={options.narration || undefined}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
          {text('Sound', 'Sunet')}:{' '}
          {options.narration
            ? text('My narration', 'Narațiunea mea')
            : options.music?.source_audio === 'mute'
              ? text('Music only', 'Doar muzică')
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
            variant={options.narration || options.music?.source_audio === 'mute' ? 'outline' : 'default'}
            aria-pressed={!options.narration && options.music?.source_audio !== 'mute'}
            disabled={hasNarration}
            aria-describedby={hasNarration ? `${id}-voice-note` : undefined}
            onClick={() => change({
              narration: false,
              ...(options.music ? { music: { ...options.music, source_audio: 'preserve' } } : {})
            })}
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
  )
}
