import { useId } from 'react'
import { Input } from '@/components/ui/input'
import type { StoryMusicOptions } from './types'
import { musicRangeProblem } from './story-music-model'
import { useStoryLanguage } from './use-story-language'

export function StoryMusicRange({
  value,
  onChange
}: {
  value: StoryMusicOptions
  onChange: (music: StoryMusicOptions) => void
}) {
  const text = useStoryLanguage()
  const id = useId()
  const problem = musicRangeProblem(value, text)
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm focus-visible:outline-2 focus-visible:outline-foreground">
        {text('Choose an excerpt', 'Alege un fragment')}
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs" htmlFor={`${id}-start`}>
            <span>{text('Start (seconds)', 'Început (secunde)')}</span>
            <Input
              id={`${id}-start`}
              type="number"
              min="0"
              max="1799"
              step="0.1"
              inputMode="decimal"
              aria-invalid={Boolean(problem)}
              aria-describedby={`${id}-hint`}
              value={value.start_seconds ?? 0}
              onChange={(event) =>
                onChange({
                  ...value,
                  start_seconds: Number(event.target.value)
                })
              }
            />
          </label>
          <label className="space-y-1 text-xs" htmlFor={`${id}-end`}>
            <span>{text('End (seconds)', 'Sfârșit (secunde)')}</span>
            <Input
              id={`${id}-end`}
              type="number"
              min="1"
              max="1800"
              step="0.1"
              inputMode="decimal"
              aria-invalid={Boolean(problem)}
              aria-describedby={`${id}-hint`}
              placeholder={text('Automatic', 'Automat')}
              value={value.end_seconds || ''}
              onChange={(event) =>
                onChange({ ...value, end_seconds: Number(event.target.value) })
              }
            />
          </label>
        </div>
        <p
          id={`${id}-hint`}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {text(
            'Choose up to 10 minutes. Leave End blank to use the available music, up to 10 minutes from your start.',
            'Alege maximum 10 minute. Lasă Sfârșit gol pentru a folosi muzica disponibilă, până la 10 minute de la începutul ales.'
          )}
        </p>
        {problem && (
          <p role="alert" className="text-xs text-destructive">
            {problem}
          </p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-foreground"
            checked={value.loop ?? true}
            onChange={(event) =>
              onChange({ ...value, loop: event.target.checked })
            }
          />
          {text(
            'Repeat the excerpt if the video is longer',
            'Repetă fragmentul dacă videoul este mai lung'
          )}
        </label>
        <p className="text-xs text-muted-foreground">
          {text(
            'Otherwise the music fades out when the excerpt ends.',
            'Altfel, muzica se estompează când fragmentul se termină.'
          )}
        </p>
      </div>
    </details>
  )
}
