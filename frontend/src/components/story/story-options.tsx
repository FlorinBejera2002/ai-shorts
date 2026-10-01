import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { StoryHelp } from './story-help'
import type { StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'

interface Props {
  options: StoryOptions
  disabled: boolean
  hasNarration?: boolean
  section?: 'story' | 'settings' | 'all'
  onChange: (options: StoryOptions) => void
}

export function StoryOptionsPanel({
  options,
  disabled,
  hasNarration = false,
  section = 'all',
  onChange
}: Props) {
  const text = useStoryLanguage()
  const id = useId()
  const change = (patch: Partial<StoryOptions>) => onChange({ ...options, ...patch })

  return (
    <Card className="block space-y-5 p-5">
      <fieldset disabled={disabled} className="min-w-0 space-y-5 disabled:opacity-60">
        {section !== 'settings' && (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium">
                  {text('Choose the sound', 'Alege sunetul')}
                </span>
                <StoryHelp label={text('Story sound', 'Sunetul poveștii')}>
                  {text(
                    'Use the sound already in your recordings, or record your voice and let the images follow your story.',
                    'Folosește sunetul din filmări sau înregistrează-ți vocea și lasă imaginile să urmeze povestea ta.'
                  )}
                </StoryHelp>
              </div>
              <div
                className="grid gap-2 sm:grid-cols-2"
                role="group"
                aria-label={text('Story sound', 'Sunetul poveștii')}
              >
                <Button
                  type="button"
                  className="h-auto min-h-11 whitespace-normal px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                  className="h-auto min-h-11 whitespace-normal px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  variant={options.narration ? 'default' : 'outline'}
                  aria-pressed={Boolean(options.narration)}
                  onClick={() => change({ narration: true, preserve_order: false })}
                >
                  {text('My voice over the images', 'Vocea mea peste imagini')}
                </Button>
              </div>
              {hasNarration && (
                <p id={`${id}-voice-note`} className="text-xs text-muted-foreground">
                  {text(
                    'Remove your voice recording to use the sound from your clips.',
                    'Șterge înregistrarea vocală pentru a folosi sunetul filmărilor.'
                  )}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label htmlFor={`${id}-brief`} className="text-sm font-medium">
                  {text('Tell AI how to edit', 'Spune-i AI-ului cum să monteze')}{' '}
                  <span className="font-normal text-muted-foreground">
                    {text('(optional)', '(opțional)')}
                  </span>
                </label>
                <StoryHelp label={text('AI editing direction', 'Instrucțiuni pentru montaj')}>
                  {text(
                    'Describe the result you want: what to emphasize, the pace or mood, and how the story should end. AI only uses moments supported by your clips.',
                    'Descrie rezultatul dorit: ce să scoată în evidență, ritmul sau atmosfera și cum să se termine povestea. AI-ul folosește doar momente existente în filmările tale.'
                  )}
                </StoryHelp>
              </div>
              <Textarea
                id={`${id}-brief`}
                className="min-h-28 rounded-md"
                maxLength={4000}
                value={options.brief}
                onChange={(event) => change({ brief: event.target.value })}
                placeholder={text(
                  'Make an energetic mountain recap. Start with the lake, keep the best family moments, and finish with the cabin view…',
                  'Fă un rezumat dinamic al excursiei. Începe cu lacul, păstrează cele mai frumoase momente cu familia și termină cu priveliștea spre cabană…'
                )}
              />
            </div>
          </>
        )}
        {section !== 'story' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <label htmlFor={`${id}-duration`} className="text-sm font-medium">
                    {text('Length', 'Durată')}
                  </label>
                  <StoryHelp label={text('Video length', 'Durata filmului')}>
                    {options.narration
                      ? text(
                          'Your full voice recording sets the length. The images are arranged around it.',
                          'Înregistrarea vocală completă stabilește durata. Imaginile sunt aranjate în jurul ei.'
                        )
                      : text(
                          'Choose an approximate length. Your video can be shorter when the story needs less time.',
                          'Alege o durată aproximativă. Filmul poate fi mai scurt dacă povestea are nevoie de mai puțin timp.'
                        )}
                  </StoryHelp>
                </div>
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
                    className="text-xs text-muted-foreground"
                  >
                    {text(
                      'Matches your full voice recording.',
                      'Urmează durata înregistrării vocale.'
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <label htmlFor={`${id}-shape`} className="text-sm font-medium">
                    {text('Shape', 'Format')}
                  </label>
                  <StoryHelp label={text('Video shape', 'Formatul filmului')}>
                    {text(
                      'Portrait works well on phones. Choose square or landscape for other places you want to share.',
                      'Formatul vertical se potrivește pe telefon. Alege pătrat sau orizontal pentru alte locuri în care vrei să distribui filmul.'
                    )}
                  </StoryHelp>
                </div>
                <select
                  id={`${id}-shape`}
                  className="story-select"
                  value={options.aspect_ratio}
                  onChange={(event) => change({ aspect_ratio: event.target.value })}
                >
                  <option value="9:16">{text('Portrait', 'Vertical')} · 9:16</option>
                  <option value="1:1">{text('Square', 'Pătrat')} · 1:1</option>
                  <option value="16:9">{text('Landscape', 'Orizontal')} · 16:9</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  className="size-4 accent-foreground"
                  type="checkbox"
                  checked={options.captions}
                  onChange={(event) => change({ captions: event.target.checked })}
                />
                {text('Add captions', 'Adaugă subtitrări')}
              </label>
              <StoryHelp label={text('Captions', 'Subtitrări')}>
                {text(
                  'Captions follow the spoken words in your finished video. Unclear speech may need your review.',
                  'Subtitrările urmează cuvintele rostite în filmul final. Vorbirea neclară poate avea nevoie de verificarea ta.'
                )}
              </StoryHelp>
            </div>
            <details className="group rounded-md border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
                {text('More options', 'Mai multe opțiuni')}
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-4 border-t p-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <label htmlFor={`${id}-language`} className="text-sm font-medium">
                      {text('Spoken language', 'Limba vorbită')}
                    </label>
                    <StoryHelp label={text('Spoken language', 'Limba vorbită')}>
                      {text(
                        'Leave this on automatic, or choose the language you speak to help us understand your recording.',
                        'Lasă detectarea automată sau alege limba vorbită pentru a ne ajuta să înțelegem înregistrarea.'
                      )}
                    </StoryHelp>
                  </div>
                  <select
                    id={`${id}-language`}
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
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <label htmlFor={`${id}-editing`} className="text-sm font-medium">
                      {text('Editing style', 'Stilul montajului')}
                    </label>
                    <StoryHelp label={text('Editing style', 'Stilul montajului')}>
                      {text(
                        'Automatic connects the moments that tell your story. Careful selection makes fewer connections when the context is uncertain.',
                        'Modul automat leagă momentele care spun povestea. Selecția prudentă face mai puține legături atunci când contextul este neclar.'
                      )}
                    </StoryHelp>
                  </div>
                  <select
                    id={`${id}-editing`}
                    className="story-select"
                    value={options.mode}
                    onChange={(event) => change({ mode: event.target.value })}
                  >
                    <option value="smart">{text('Automatic', 'Automat')}</option>
                    <option value="strict">
                      {text('Careful selection', 'Selecție prudentă')}
                    </option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        className="size-4 accent-foreground"
                        type="checkbox"
                        checked={options.preserve_order}
                        disabled={Boolean(options.narration)}
                        aria-describedby={
                          options.narration ? `${id}-order-note` : undefined
                        }
                        onChange={(event) =>
                          change({ preserve_order: event.target.checked })
                        }
                      />
                      {text('Keep my clip order', 'Păstrează ordinea filmărilor')}
                    </label>
                    <StoryHelp label={text('Clip order', 'Ordinea filmărilor')}>
                      {text(
                        'Keep the order you chose when adding your recordings. Otherwise, we arrange the moments to tell the story.',
                        'Păstrează ordinea aleasă când ai adăugat filmările. Altfel, aranjăm momentele pentru a spune povestea.'
                      )}
                    </StoryHelp>
                  </div>
                  {options.narration && (
                    <p
                      id={`${id}-order-note`}
                      className="text-xs text-muted-foreground"
                    >
                      {text(
                        'The images follow your voice recording.',
                        'Imaginile urmează înregistrarea vocală.'
                      )}
                    </p>
                  )}
                </div>
              </div>
            </details>
          </>
        )}
      </fieldset>
    </Card>
  )
}
