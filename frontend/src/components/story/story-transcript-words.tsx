import type { StoryTranscriptProposal } from './types'
import { formatStoryTime } from './story-time'
import { useStoryLanguage } from './use-story-language'

interface Props {
  proposal: StoryTranscriptProposal
  words: string[]
  editable: boolean
  disabled: boolean
  canListen: boolean
  onWord: (index: number, text: string) => void
  onListen: (start: number) => void
}

export function StoryTranscriptWords({
  proposal, words, editable, disabled, canListen, onWord, onListen
}: Props) {
  const text = useStoryLanguage()
  return (
    <div className="flex flex-wrap gap-2">
      {proposal.words.map((word, index) => (
        <div
          key={`${proposal.id}:${index}`}
          className="flex max-w-full flex-col gap-1 text-xs"
        >
          <button
            type="button"
            disabled={!canListen || !Number.isFinite(word.start) || word.start < 0}
            aria-label={`${text('Play from word', 'Redă de la cuvântul')} ${index + 1}: ${words[index] ?? word.text}`}
            onClick={() => onListen(word.start)}
            className="self-start rounded-sm px-1 py-1 tabular-nums text-muted-foreground underline underline-offset-2 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground disabled:opacity-60"
          >
            {formatStoryTime(word.start)}
          </button>
          <input
            type="text"
            value={words[index] ?? word.text}
            maxLength={200}
            disabled={disabled || !editable}
            aria-label={`${text('Word', 'Cuvânt')} ${index + 1} · ${formatStoryTime(word.start)}`}
            style={{
              width: `${Math.min(24, Math.max(7, (words[index] ?? word.text).length + 2))}ch`
            }}
            className="max-w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
            onChange={(event) => onWord(index, event.target.value)}
          />
        </div>
      ))}
    </div>
  )
}
