import type { StoryAsset, StoryTranscriptApproval } from './types'

/** Timings always remain server-owned; review changes only the recorded words. */
export function transcriptApprovals(
  asset: StoryAsset,
  selected: string[],
  drafts: Record<string, string[]>
): StoryTranscriptApproval[] {
  return selected.map((id) => {
    const proposal = asset.transcript_proposals?.find((item) => item.id === id)
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
