import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'

interface Props {
  options: StoryOptions
  disabled: boolean
  hasNarration?: boolean
  onChange: (options: StoryOptions) => void
}

export function StoryOptionsPanel({
  options,
  disabled,
  hasNarration = false,
  onChange
}: Props) {
  const text = useStoryLanguage()
  const change = (patch: Partial<StoryOptions>) => onChange({ ...options, ...patch })
  return (
    <Card className="block space-y-5 p-5">
      <div>
        <h2 className="font-semibold">
          {text('Shape your story', 'Construiește povestea')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {text(
            'One Natural edit, built from your original recordings.',
            'Un singur montaj Natural, din filmările tale originale.'
          )}
        </p>
      </div>
      <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {text('Tell your story', 'Spune-ți povestea')}
          </p>
          <div
            className="grid gap-2"
            aria-label={text('Story audio', 'Sunetul poveștii')}
          >
            <Button
              variant={options.narration ? 'outline' : 'default'}
              aria-pressed={!options.narration}
              disabled={hasNarration}
              onClick={() => change({ narration: false })}
            >
              {text('Build from recorded clips', 'Montează din filmări')}
            </Button>
            <Button
              variant={options.narration ? 'default' : 'outline'}
              aria-pressed={Boolean(options.narration)}
              onClick={() => change({ narration: true, preserve_order: false })}
            >
              {text('Narrate your footage', 'Povestește peste imagini')}
            </Button>
          </div>
          {hasNarration && (
            <p className="text-xs text-muted-foreground">
              {text(
                'Remove your narration to use the sound from your clips instead.',
                'Elimină narațiunea pentru a folosi sunetul filmărilor.'
              )}
            </p>
          )}
        </div>
        <label className="block space-y-2 text-sm">
          <span className="font-medium">
            {text(
              'What should the viewer understand?',
              'Ce trebuie să înțeleagă privitorul?'
            )}
          </span>
          <Textarea
            className="rounded-md"
            maxLength={4000}
            value={options.brief}
            onChange={(event) => change({ brief: event.target.value })}
            placeholder={text(
              'Optional: the main message, audience, or ideas to keep',
              'Opțional: mesajul principal, publicul sau ideile de păstrat'
            )}
          />
          <span className="block text-xs text-muted-foreground">
            {text(
              'Your brief guides the edit. Spoken words always come from your sources.',
              'Brief-ul ghidează montajul. Cuvintele rostite provin întotdeauna din surse.'
            )}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5 text-sm">
            <span className="block font-medium">
              {text('Target duration', 'Durată dorită')}
            </span>
            <select
              className="story-select"
              value={options.target_seconds}
              aria-label={text('Target duration', 'Durată dorită')}
              disabled={Boolean(options.narration)}
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
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="block font-medium">{text('Format', 'Format')}</span>
            <select
              className="story-select"
              value={options.aspect_ratio}
              onChange={(event) => change({ aspect_ratio: event.target.value })}
            >
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="16:9">16:9</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {options.narration
            ? text(
                'Your full narration sets the duration. We arrange the footage around your voice.',
                'Narațiunea completă stabilește durata. Aranjăm filmările în jurul vocii tale.'
              )
            : text(
                'A target, not a quota. The edit can be shorter to keep the story natural.',
                'O țintă, nu o cotă. Montajul poate fi mai scurt pentru a păstra naturalețea.'
              )}
        </p>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">
            {text('Spoken language', 'Limba vorbită')}
          </span>
          <select
            className="story-select"
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
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{text('Assembly', 'Asamblare')}</span>
          <select
            className="story-select"
            value={options.mode}
            onChange={(event) => change({ mode: event.target.value })}
          >
            <option value="smart">
              {text('Smart assembly', 'Asamblare inteligentă')}
            </option>
            <option value="strict">
              {text('Strict source selection', 'Selecție strictă din surse')}
            </option>
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-1 accent-foreground"
            type="checkbox"
            checked={options.preserve_order}
            disabled={Boolean(options.narration)}
            onChange={(event) => change({ preserve_order: event.target.checked })}
          />
          {text('Preserve my source order', 'Păstrează ordinea surselor mele')}
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-1 accent-foreground"
            type="checkbox"
            checked={options.captions}
            onChange={(event) => change({ captions: event.target.checked })}
          />
          {text(
            'Captions from the final spoken words',
            'Subtitrări din cuvintele rostite în montaj'
          )}
        </label>
      </fieldset>
    </Card>
  )
}
