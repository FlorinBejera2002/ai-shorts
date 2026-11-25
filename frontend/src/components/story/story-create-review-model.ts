import type { StoryAsset, StoryOptions } from './types'

/** Footage reference tokens in a brief, e.g. `@[asset:3f2a]`. */
const footageToken = /@\[asset:([^\]\s]+)\]/g

export type BriefSegment = { type: 'text'; value: string } | { type: 'footage'; assetId: string }

/** Splits a brief into plain text and footage references, in reading order. */
export function briefSegments(brief: string): BriefSegment[] {
  const segments: BriefSegment[] = []
  let last = 0
  for (const match of brief.matchAll(footageToken)) {
    const start = match.index ?? 0
    if (start > last) segments.push({ type: 'text', value: brief.slice(last, start) })
    segments.push({ type: 'footage', assetId: match[1] })
    last = start + match[0].length
  }
  if (last < brief.length) segments.push({ type: 'text', value: brief.slice(last) })
  return segments
}

/** 1-based footage number of an asset in the footage order, or undefined when it is not footage. */
export function footageNumber(videos: StoryAsset[], assetId: string) {
  const position = videos.findIndex((asset) => asset.id === assetId)
  return position < 0 ? undefined : position + 1
}

/**
 * Footage that gets noise reduction. An empty or missing selection means all footage,
 * matching the backend default.
 */
export function noiseReducedFootage(options: StoryOptions, videos: StoryAsset[]) {
  const selected = (options.audio_cleanup as { asset_ids?: string[] } | undefined)?.asset_ids ?? []
  if (!selected.length) return videos
  const selectedIDs = new Set(selected)
  return videos.filter((asset) => selectedIDs.has(asset.id))
}

/** Requested clip count: 0 is automatic, 1–30 is a fixed number. */
export function clipCountOf(options: StoryOptions) {
  const count = (options as StoryOptions & { clip_count?: number }).clip_count ?? 0
  return Number.isFinite(count) ? Math.min(30, Math.max(0, Math.trunc(count))) : 0
}
