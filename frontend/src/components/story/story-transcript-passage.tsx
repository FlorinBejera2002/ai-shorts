import { Button } from '@/components/ui/button'
import type { StoryTranscriptProposal } from './types'
import { formatStoryTime } from './story-time'
import { useStoryLanguage } from './use-story-language'

export function StoryTranscriptPassage({
  proposal,
  words,
  selected,
  disabled,
  canListen,
  onWord,
  onSelect,
  onListen
}: {
  proposal: StoryTranscriptProposal
  words: string[]
  selected: boolean
  disabled: boolean
  canListen: boolean
  onWord: (index: number, text: string) => void
  onSelect: (selected: boolean) => void
  onListen: () => void
}) {
  const text = useStoryLanguage()
  const editable = proposal.timing_verified && words.length > 0
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-3 rounded-md border p-3"
      data-testid="transcript-passage"
    >
      <legend className="px-1 text-xs tabular-nums text-muted-foreground">
        {formatStoryTime(proposal.in)}–{formatStoryTime(proposal.out)}
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium">
          {proposal.reviewed
            ? text('Reviewed transcript', 'Transcriere verificată')
            : text('Unverified transcript', 'Transcriere neverificată')}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canListen || disabled}
          onClick={onListen}
        >
          {text('Listen to passage', 'Ascultă pasajul')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {editable
          ? text(
              'Speech recognition was uncertain. Listen to the recording and correct the words before confirming them.',
              'Recunoașterea vorbirii a fost nesigură. Ascultă înregistrarea și corectează cuvintele înainte de confirmare.'
            )
          : text(
              'Word timing has not been verified. This proposal cannot be approved for captions yet.',
              'Timpii cuvintelor nu au fost verificați. Această propunere nu poate fi confirmată pentru subtitrări încă.'
            )}
      </p>
      <div className="flex flex-wrap gap-2">
        {proposal.words.map((word, index) => (
          <label
            key={`${proposal.id}:${index}`}
            className="flex max-w-full flex-col gap-1 text-xs"
          >
            <span className="tabular-nums text-muted-foreground">
              {formatStoryTime(word.start)}
            </span>
            <input
              type="text"
              value={words[index] ?? word.text}
              maxLength={200}
              disabled={!editable}
              aria-label={`${text('Word', 'Cuvânt')} ${index + 1} · ${formatStoryTime(word.start)}`}
              style={{
                width: `${Math.min(24, Math.max(7, (words[index] ?? word.text).length + 2))}ch`
              }}
              className="max-w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
              onChange={(event) => onWord(index, event.target.value)}
            />
          </label>
        ))}
      </div>
      {editable && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
            className="mt-1 accent-foreground"
          />
          {text(
            'I checked this passage against the recording.',
            'Am verificat acest pasaj ascultând înregistrarea.'
          )}
        </label>
      )}
    </fieldset>
  )
}
