import type {
  StoryAsset,
  StoryTranscriptApproval,
  StoryTranscriptProposal,
  StoryWord
} from './types'

export type TranscriptTimingProblem = 'count' | 'bounds' | 'text' | 'order'

/** Manual timing is explicit owner evidence, never silently inferred from text. */
export function transcriptTimingProblem(
  proposal: StoryTranscriptProposal,
  duration: number,
  words: StoryWord[]
): TranscriptTimingProblem | null {
  if (!words.length || words.length > 500) return 'count'
  const end = proposal.out
  if (!Number.isFinite(duration) || !Number.isFinite(proposal.in) ||
      !Number.isFinite(end) || proposal.in < 0 || end <= proposal.in || end > duration)
    return 'bounds'
  let previousEnd = proposal.in
  for (const word of words) {
    const hasControl = Array.from(word.text).some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || (code >= 127 && code <= 159)
    })
    if (!word.text.trim() || [...word.text.trim()].length > 256 || hasControl)
      return 'text'
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) ||
        word.start < proposal.in || word.end > end || word.end <= word.start)
      return 'bounds'
    if (word.start < previousEnd) return 'order'
    previousEnd = word.end
  }
  return null
}

/** Normal reviews retain measured clocks; manual reviews send explicit timing. */
export function transcriptApprovals(
  asset: StoryAsset,
  selected: string[],
  drafts: Record<string, string[]>,
  timingDrafts: Record<string, StoryWord[]> = {}
): StoryTranscriptApproval[] {
  return selected.map((id) => {
    const proposal = asset.transcript_proposals?.find((item) => item.id === id)
    const timed = timingDrafts[id]
    if (proposal && timed) {
      if (transcriptTimingProblem(proposal, asset.duration, timed))
        throw new Error('Correct every word and its timing before confirming.')
      return {
        asset_id: asset.id,
        proposal_id: id,
        timed_words: timed.map((word) => ({ ...word, text: word.text.trim() })),
        timing_confirmed: true
      }
    }
    if (!proposal?.timing_verified || !proposal.words.length)
      throw new Error('This passage does not have verified word timing.')
    const words = (drafts[id] ?? proposal.words.map((word) => word.text)).map(
      (word) => word.trim()
    )
    if (words.length !== proposal.words.length || words.some((word) => !word))
      throw new Error(
        'Enter text for every word before approving this passage.'
      )
    return { asset_id: asset.id, proposal_id: id, words }
  })
}
