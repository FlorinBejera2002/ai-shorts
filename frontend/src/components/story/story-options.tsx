import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { storyCaptionMode, type StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'
import { StoryAppearance, StoryAppearancePreview } from './story-appearance'
import { useStoryAppearance } from './use-story-appearance'
import { StorySoundOptions } from './story-sound-options'
import { StoryMusic } from './story-music'
import { StoryFormat } from './story-format'
import { StoryDynamicRange } from './story-dynamic-range'

interface Props {
  options: StoryOptions
  disabled: boolean
  active?: boolean
  hasNarration?: boolean
  section?: 'story' | 'settings' | 'all'
  workspace?: boolean
  preview?: ReactNode
  narration?: ReactNode
  onChange: (options: StoryOptions) => void
}

export function StoryOptionsPanel({
  options,
  disabled,
  active = true,
  hasNarration = false,
  section = 'all',
  workspace = false,
  preview,
  narration,
  onChange
}: Props) {
  const text = useStoryLanguage()
  const id = useId()
  const appearance = useStoryAppearance(options)
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
    <div
      className={`story-options-composition ${workspace ? 'story-options-composition-workspace' : ''}`}
    >
      <fieldset
        disabled={disabled}
        className="story-options-inspector min-w-0 space-y-5 disabled:opacity-60"
      >
        {section !== 'settings' && (
          <StorySoundOptions
            options={options}
            hasNarration={hasNarration}
            onChange={onChange}
          />
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
              <div className="story-caption-choices grid gap-1.5">
                {captionModes.map(({ value, label }) => (
                  <label
                    key={value}
                    className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground ${storyCaptionMode(options) === value ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                  >
                    <input
                      type="radio"
                      className="size-4 shrink-0 accent-current"
                      name={`${id}-captions`}
                      value={value}
                      checked={storyCaptionMode(options) === value}
                      onChange={() =>
                        change({
                          caption_mode: value,
                          captions: value !== 'off'
                        })
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
              appearance={appearance}
              onChange={onChange}
            />
            <details className="story-disclosure group border-t pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
                {text('Format & preferences', 'Format și preferințe')}
                <ChevronDown
                  className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div className="mt-4 grid gap-4">
                <div className="space-y-2 text-sm">
                  <label
                    htmlFor={`${id}-duration`}
                    className="block font-medium"
                  >
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
                <StoryFormat
                  value={options.aspect_ratio}
                  onChange={(aspect_ratio) => change({ aspect_ratio })}
                />
                <StoryDynamicRange
                  value={options.dynamic_range}
                  onChange={(dynamic_range) => change({ dynamic_range })}
                />
                <label className="space-y-2 text-sm">
                  <span className="block font-medium">
                    {text('Spoken language', 'Limba vorbită')}
                  </span>
                  <select
                    className="story-select"
                    aria-label={text('Spoken language', 'Limba vorbită')}
                    value={options.language}
                    onChange={(event) =>
                      change({ language: event.target.value })
                    }
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
                    <option value="smart">
                      {text('Automatic', 'Automat')}
                    </option>
                    <option value="strict">
                      {text('Careful selection', 'Selecție prudentă')}
                    </option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
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
      <div className="story-options-workarea space-y-5">
        <div className="story-options-preview">
          <div hidden={section !== 'story' && appearance.visible}>
            {preview}
          </div>
          {section !== 'story' && (
            <StoryAppearancePreview
              options={options}
              disabled={disabled}
              appearance={appearance}
              onChange={onChange}
            />
          )}
        </div>
        {section !== 'settings' && (
          <>
            <fieldset disabled={disabled} className="min-w-0 space-y-2">
              <label htmlFor={`${id}-brief`} className="text-sm font-medium">
                {text('Describe your video', 'Descrie videoul dorit')}{' '}
                <span className="ml-1 font-normal text-muted-foreground">
                  {text('(optional)', '(opțional)')}
                </span>
              </label>
              <Textarea
                id={`${id}-brief`}
                className="story-direction-input min-h-18 resize-y rounded-md"
                rows={2}
                maxLength={4000}
                value={options.brief}
                onChange={(event) => change({ brief: event.target.value })}
                placeholder={text(
                  'What should we focus on?',
                  'Pe ce să ne concentrăm?'
                )}
              />
            </fieldset>
            <StoryMusic
              value={options.music}
              disabled={disabled}
              active={active}
              onChange={(music) => change({ music })}
            />
            {narration}
          </>
        )}
      </div>
    </div>
  )
}
