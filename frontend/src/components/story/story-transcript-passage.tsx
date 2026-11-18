import type { StoryTranscriptProposal, StoryWord } from './types'
import { formatStoryTime } from './story-time'
import { useStoryLanguage } from './use-story-language'
import { StoryTranscriptTiming } from './story-transcript-timing'
import { StoryTranscriptWords } from './story-transcript-words'
import { StoryTranscriptPassageHeader } from './story-transcript-passage-header'
import { transcriptTimingProblem } from './story-transcript-model'

export function StoryTranscriptPassage({
  proposal,
  duration,
  timingWords,
  words,
  selected,
  disabled,
  canListen,
  onWord,
  onSelect,
  onListen,
  onTiming,
  playbackTime
}: {
  proposal: StoryTranscriptProposal
  duration: number
  timingWords?: StoryWord[]
  words: string[]
  selected: boolean
  disabled: boolean
  canListen: boolean
  onWord: (index: number, text: string) => void
  onSelect: (selected: boolean) => void
  onListen: (start: number) => void
  onTiming: (words: StoryWord[]) => void
  playbackTime: () => number
}) {
  const text = useStoryLanguage()
  const editable = proposal.timing_verified && words.length > 0
  const timingProblem = timingWords
    ? transcriptTimingProblem(proposal, duration, timingWords)
    : null
  return (
    <fieldset
      className="min-w-0 space-y-3 rounded-md border p-3"
      data-testid="transcript-passage"
    >
      <legend className="px-1 text-xs tabular-nums text-muted-foreground">
        {formatStoryTime(proposal.in)}–{formatStoryTime(proposal.out)}
      </legend>
      <StoryTranscriptPassageHeader
        proposal={proposal}
        editable={editable}
        correctingTiming={Boolean(timingWords)}
        disabled={disabled}
        canListen={canListen}
        onListen={onListen}
        onTiming={onTiming}
      />
      {timingWords ? (
        <StoryTranscriptTiming
          proposal={proposal}
          duration={duration}
          words={timingWords}
          disabled={disabled}
          canListen={canListen}
          onChange={onTiming}
          onListen={onListen}
          playbackTime={playbackTime}
        />
      ) : (
        <StoryTranscriptWords
          proposal={proposal}
          words={words}
          editable={editable}
          disabled={disabled}
          canListen={canListen}
          onWord={onWord}
          onListen={onListen}
        />
      )}
      {(editable || timingWords) && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled || Boolean(timingProblem) || !canListen}
            onChange={(event) => onSelect(event.target.checked)}
            className="mt-1 accent-foreground"
          />
          {timingWords
            ? text(
                'I checked the words and timing against the recording.',
                'Am verificat cuvintele și timpii ascultând înregistrarea.'
              )
            : text(
                'I checked this passage against the recording.',
                'Am verificat acest pasaj ascultând înregistrarea.'
              )}
        </label>
      )}
    </fieldset>
  )
}
