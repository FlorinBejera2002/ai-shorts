import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { storyCaptionMode, type StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'
import { StoryAppearance } from './story-appearance'
import { StoryMusic } from './story-music'
import { useAudioCleanupAvailability } from '@/hooks/use-audio-cleanup-availability'
import { useTranslations } from 'next-intl'

interface Props {
  options: StoryOptions
  disabled: boolean
  active?: boolean
  hasNarration?: boolean
  section?: 'story' | 'settings' | 'all'
  onChange: (options: StoryOptions) => void
}

export function StoryOptionsPanel({
  options,
  disabled,
  active = true,
  hasNarration = false,
  section = 'all',
  onChange
}: Props) {
  const text = useStoryLanguage()
  const id = useId()
  const cleanup = useAudioCleanupAvailability()
  const audio = useTranslations('audioCleanup')
  const change = (patch: Partial<StoryOptions>) =>
    onChange({ ...options, ...patch })
  const captionModes = [
    { value: 'all', label: text('All dialogue', 'Pe tot dialogul') },
    {
      value: 'selective',
      label: text('Only hard-to-hear speech', 'Doar unde se aude greu')
    },
    { value: 'off', label: text('No captions', 'Fără subtitrări') }
  ] as const

  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-6 disabled:opacity-60"
    >
      {section !== 'settings' && (
        <>
          <div className="space-y-3">
            <label htmlFor={`${id}-brief`} className="text-sm font-medium">
              {text('Describe your video', 'Descrie videoul dorit')}{' '}
              <span className="ml-1 font-normal text-muted-foreground">
                {text('(optional)', '(opțional)')}
              </span>
            </label>
            <Textarea
              id={`${id}-brief`}
              className="min-h-40 rounded-md"
              maxLength={4000}
              value={options.brief}
              onChange={(event) => change({ brief: event.target.value })}
              placeholder={text(
                'Start with the lake, keep the family moments, and end with the cabin view. Keep the original sound.',
                'Începe cu lacul, păstrează momentele cu familia și termină cu priveliștea spre cabană. Păstrează sunetul original.'
              )}
            />
          </div>
          <details
            className="group border-t pt-4"
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
              className="mt-4 grid gap-2 sm:grid-cols-2"
              role="group"
              aria-label={text('Story sound', 'Sunetul poveștii')}
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
                className="mt-3 text-sm text-muted-foreground"
              >
                {text(
                  'Remove your voice recording to use the sound from your clips.',
                  'Șterge înregistrarea vocală pentru a folosi sunetul filmărilor.'
                )}
              </p>
            )}
          </details>
          <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
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
                  : text(
                      'For speech recordings. Keep this off for music or atmosphere you want to preserve. Other voices and strong echo may remain.',
                      'Pentru înregistrări vorbite. Lasă opțiunea oprită pentru muzică sau ambianța pe care vrei să o păstrezi. Alte voci și ecoul puternic pot rămâne.'
                    )}
              </span>
            </span>
          </label>
          <StoryMusic
            value={options.music}
            disabled={disabled}
            active={active}
            onChange={(music) => change({ music })}
          />
        </>
      )}
      {section !== 'story' && (
        <>
          <fieldset className="space-y-3">
            <legend
              className={
                section === 'all' ? 'mb-3 text-sm font-medium' : 'sr-only'
              }
            >
              {text('Captions', 'Subtitrări')}
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {captionModes.map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground ${storyCaptionMode(options) === value ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted'}`}
                >
                  <input
                    type="radio"
                    className="size-4 shrink-0 accent-current"
                    name={`${id}-captions`}
                    value={value}
                    checked={storyCaptionMode(options) === value}
                    onChange={() =>
                      change({ caption_mode: value, captions: value !== 'off' })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <StoryAppearance
            options={options}
            disabled={disabled}
            onChange={onChange}
          />
          <details className="group border-t pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
              {text('Format & preferences', 'Format și preferințe')}
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 text-sm">
                <label htmlFor={`${id}-duration`} className="block font-medium">
                  {text('Length', 'Durată')}
                </label>
                <select
                  id={`${id}-duration`}
                  className="story-select"
                  value={options.target_seconds}
                  disabled={Boolean(options.narration)}
                  aria-describedby={
                    options.narration ? `${id}-duration-note` : undefined
                  }
                  onChange={(event) =>
                    change({ target_seconds: Number(event.target.value) })
                  }
                >
                  {[15, 30, 45, 60, 90].map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds} sec
                    </option>
                  ))}
                </select>
                {options.narration && (
                  <p
                    id={`${id}-duration-note`}
                    className="text-muted-foreground"
                  >
                    {text(
                      'Matches your full narration.',
                      'Urmează narațiunea completă.'
                    )}
                  </p>
                )}
              </div>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">
                  {text('Shape', 'Format')}
                </span>
                <select
                  className="story-select"
                  aria-label={text('Shape', 'Format')}
                  value={options.aspect_ratio}
                  onChange={(event) =>
                    change({ aspect_ratio: event.target.value })
                  }
                >
                  <option value="9:16">
                    {text('Portrait', 'Vertical')} · 9:16
                  </option>
                  <option value="1:1">{text('Square', 'Pătrat')} · 1:1</option>
                  <option value="16:9">
                    {text('Landscape', 'Orizontal')} · 16:9
                  </option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">
                  {text('Spoken language', 'Limba vorbită')}
                </span>
                <select
                  className="story-select"
                  aria-label={text('Spoken language', 'Limba vorbită')}
                  value={options.language}
                  onChange={(event) => change({ language: event.target.value })}
                >
                  <option value="auto">
                    {text('Detect automatically', 'Detectare automată')}
                  </option>
                  <option value="ro">Română</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">
                  {text('Editing style', 'Stilul montajului')}
                </span>
                <select
                  className="story-select"
                  aria-label={text('Editing style', 'Stilul montajului')}
                  value={options.mode}
                  onChange={(event) => change({ mode: event.target.value })}
                >
                  <option value="smart">{text('Automatic', 'Automat')}</option>
                  <option value="strict">
                    {text('Careful selection', 'Selecție prudentă')}
                  </option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  className="size-4 accent-foreground"
                  type="checkbox"
                  checked={options.preserve_order}
                  disabled={Boolean(options.narration)}
                  onChange={(event) =>
                    change({ preserve_order: event.target.checked })
                  }
                />
                {text('Keep my clip order', 'Păstrează ordinea filmărilor')}
              </label>
            </div>
          </details>
        </>
      )}
    </fieldset>
  )
}
