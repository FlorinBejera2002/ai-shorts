import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { StoryTranscriptProposal, StoryWord } from './types'
import { transcriptTimingProblem } from './story-transcript-model'
import { useStoryLanguage } from './use-story-language'

interface Props {
  proposal: StoryTranscriptProposal
  duration: number
  words: StoryWord[]
  disabled: boolean
  canListen: boolean
  onChange: (words: StoryWord[]) => void
  onListen: (start: number) => void
  playbackTime: () => number
}

export function StoryTranscriptTiming({
  proposal, duration, words, disabled, canListen, onChange, onListen, playbackTime
}: Props) {
  const text = useStoryLanguage()
  const problem = transcriptTimingProblem(proposal, duration, words)
  const end = Math.min(proposal.out, duration)
  const messages = {
    count: text('Keep between 1 and 500 words.', 'Păstrează între 1 și 500 de cuvinte.'),
    text: text('Enter valid text for every word.', 'Completează fiecare cuvânt cu text valid.'),
    bounds: text('Each word needs a start before its end, within this passage.', 'Fiecare cuvânt trebuie să înceapă înainte de sfârșit, în limitele pasajului.'),
    order: text('Keep words in time order without overlapping.', 'Păstrează cuvintele în ordine cronologică, fără suprapuneri.')
  }
  function change(index: number, patch: Partial<StoryWord>) {
    onChange(words.map((word, position) => position === index ? { ...word, ...patch } : word))
  }
  function insert(after: number) {
    const start = Math.max(proposal.in, Math.min(end, words[after]?.end ?? proposal.in))
    const nextStart = words[after + 1]?.start ?? end
    const added = { text: '', start, end: Math.min(end, nextStart, start + 0.2) }
    onChange([...words.slice(0, after + 1), added, ...words.slice(after + 1)])
  }
  return (
    <div className="space-y-3" data-testid="transcript-timing-editor">
      <p className="text-xs text-muted-foreground">
        {text('Times are seconds from the start of the full recording.', 'Timpii sunt secunde de la începutul înregistrării complete.')}{' '}
        {text('Passage bounds:', 'Limitele pasajului:')} {proposal.in.toFixed(2)}–{end.toFixed(2)}s.
      </p>
      <p className="text-xs text-muted-foreground">
        {text(
          'Listen and correct each word’s start and end. Remove words that were not spoken; add any missing words. These times will be saved as checked by you.',
          'Ascultă și corectează începutul și sfârșitul fiecărui cuvânt. Elimină cuvintele nerostite și adaugă-le pe cele lipsă. Timpii vor fi salvați ca verificați de tine.'
        )}
      </p>
      <div className="space-y-3">
        {words.map((word, index) => (
          <div key={index} className="min-w-0 space-y-2 border-b pb-3">
            <label className="block space-y-1 text-xs">
              <span>{text('Word', 'Cuvântul')} {index + 1}</span>
              <Input
                value={word.text}
                maxLength={256}
                disabled={disabled}
                aria-label={`${text('Word', 'Cuvântul')} ${index + 1} ${text('text', 'text')}`}
                onChange={(event) => change(index, { text: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['start', 'end'] as const).map((field) => (
                <label key={field} className="min-w-0 space-y-1 text-xs">
                  <span>{field === 'start' ? text('Start (seconds)', 'Început (secunde)') : text('End (seconds)', 'Sfârșit (secunde)')}</span>
                  <Input
                    type="number"
                    step="0.01"
                    min={proposal.in}
                    max={end}
                    inputMode="decimal"
                    value={Number.isFinite(word[field]) ? word[field] : ''}
                    disabled={disabled}
                    aria-label={`${text('Word', 'Cuvântul')} ${index + 1} ${field === 'start' ? text('start (seconds)', 'început (secunde)') : text('end (seconds)', 'sfârșit (secunde)')}`}
                    onChange={(event) => change(index, { [field]: event.target.valueAsNumber })}
                  />
                  <button
                    type="button"
                    disabled={disabled || !canListen}
                    aria-label={`${text('Use playhead for word', 'Folosește poziția redării pentru cuvântul')} ${index + 1} ${field === 'start' ? text('start', 'început') : text('end', 'sfârșit')}`}
                    className="rounded-sm px-1 py-1 text-xs underline underline-offset-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-foreground disabled:opacity-60"
                    onClick={() => change(index, { [field]: Math.round(playbackTime() * 100) / 100 })}
                  >{text('Use playhead', 'Folosește poziția redării')}</button>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button" size="sm" variant="outline"
                disabled={!canListen || !Number.isFinite(word.start) || word.start < 0}
                aria-label={`${text('Play from word', 'Redă de la cuvântul')} ${index + 1}: ${word.text}`}
                onClick={() => onListen(word.start)}
              >{text('Play word', 'Ascultă cuvântul')}</Button>
              <Button
                type="button" size="sm" variant="ghost" disabled={disabled}
                aria-label={`${text('Remove word', 'Elimină cuvântul')} ${index + 1}`}
                onClick={() => onChange(words.filter((_, position) => position !== index))}
              >{text('Remove', 'Elimină')}</Button>
              <Button
                type="button" size="sm" variant="ghost" disabled={disabled || words.length >= 500}
                aria-label={`${text('Add word after', 'Adaugă un cuvânt după')} ${index + 1}`}
                onClick={() => insert(index)}
              >{text('Insert after', 'Inserează după')}</Button>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={disabled || words.length >= 500} onClick={() => insert(words.length - 1)}>
        {text('Add word', 'Adaugă un cuvânt')}
      </Button>
      {problem && <p role="alert" className="text-sm text-destructive">{messages[problem]}</p>}
    </div>
  )
}
