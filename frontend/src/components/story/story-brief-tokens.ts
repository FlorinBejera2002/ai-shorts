/**
 * The description ("brief") stores footage references inline as @[asset:<id>].
 * These helpers convert between that text and the segments the editor renders.
 */

export type BriefSegment =
  | { type: 'text'; text: string }
  | { type: 'footage'; assetID: string }

/** Marks a rendered footage tag and carries its asset id. */
export const FOOTAGE_ATTRIBUTE = 'data-footage-id'

/** The API limit for the description. */
export const MAX_BRIEF_LENGTH = 4000

export function footageToken(assetID: string) {
  return `@[asset:${assetID}]`
}

export function parseBrief(brief: string): BriefSegment[] {
  const segments: BriefSegment[] = []
  let last = 0
  for (const match of brief.matchAll(/@\[asset:([^\]\s]+)\]/g)) {
    const index = match.index ?? 0
    if (index > last) segments.push({ type: 'text', text: brief.slice(last, index) })
    segments.push({ type: 'footage', assetID: match[1] })
    last = index + match[0].length
  }
  if (last < brief.length) segments.push({ type: 'text', text: brief.slice(last) })
  return segments
}

export function serializeBrief(segments: BriefSegment[]) {
  return segments
    .map((segment) => (segment.type === 'text' ? segment.text : footageToken(segment.assetID)))
    .join('')
}

/** Drops every token whose footage is no longer in the project. The text around it is kept. */
export function pruneBriefFootage(brief: string, footageIDs: ReadonlySet<string>) {
  return serializeBrief(
    parseBrief(brief).filter(
      (segment) => segment.type === 'text' || footageIDs.has(segment.assetID)
    )
  )
}

/**
 * Removes every reference to one footage asset. A space typed after a removed tag goes with it,
 * so the sentence keeps a single space at the gap.
 */
export function removeFootageReferences(brief: string, assetID: string) {
  const kept: BriefSegment[] = []
  let stripSpace = false
  for (const segment of parseBrief(brief)) {
    if (segment.type === 'footage') {
      stripSpace = segment.assetID === assetID
      if (!stripSpace) kept.push(segment)
      continue
    }
    const text =
      stripSpace && segment.text.startsWith(' ') ? segment.text.slice(1) : segment.text
    stripSpace = false
    if (text) kept.push({ type: 'text', text })
  }
  return serializeBrief(kept)
}
