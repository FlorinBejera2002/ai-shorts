import { Button } from '@/components/ui/button'
import type { StoryTranscriptProposal, StoryWord } from './types'
import { useStoryLanguage } from './use-story-language'

interface Props {
  proposal: StoryTranscriptProposal
  editable: boolean
  correctingTiming: boolean
  disabled: boolean
  canListen: boolean
  onListen: (start: number) => void
  onTiming: (words: StoryWord[]) => void
}

export function StoryTranscriptPassageHeader({
  proposal, editable, correctingTiming, disabled, canListen, onListen, onTiming
}: Props) {
  const text = useStoryLanguage()
  const ownerTiming = proposal.timing_source === 'owner'
  return (
    <>
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
          disabled={!canListen}
          onClick={() => onListen(proposal.in)}
        >
          {text('Listen to passage', 'Ascultă pasajul')}
        </Button>
      </div>
      {ownerTiming && (
        <p className="text-xs text-muted-foreground">
          {text('Timing checked by you', 'Timpi verificați de tine')}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {editable
          ? text(
              'Speech recognition was uncertain. Listen to the recording and correct the words before confirming them.',
              'Recunoașterea vorbirii a fost nesigură. Ascultă înregistrarea și corectează cuvintele înainte de confirmare.'
            )
          : text(
              'Automatic word timing could not be verified. Listen and correct the timing to approve this passage.',
              'Timpii automați ai cuvintelor nu au putut fi verificați. Ascultă și corectează timpii pentru a confirma pasajul.'
            )}
      </p>
      {(!editable || ownerTiming) && !correctingTiming && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !canListen}
          onClick={() => onTiming(proposal.words.map((word) => ({ ...word })))}
        >
          {ownerTiming
            ? text('Edit timing', 'Editează timpii')
            : text('Correct timing', 'Corectează timpii')}
        </Button>
      )}
    </>
  )
}
