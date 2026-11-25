import type { StoryAsset } from './types'

/** Footage clips in timeline order. Narration recordings are not footage. */
export function storyFootage(assets: StoryAsset[]): StoryAsset[] {
  return assets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => asset.kind !== 'narration')
    .sort((a, b) => (a.asset.order ?? 0) - (b.asset.order ?? 0) || a.index - b.index)
    .map(({ asset }) => asset)
}

/** The 1-based number that "Filmarea N" shows for each footage asset. */
export function footageNumbers(footage: StoryAsset[]) {
  return new Map(footage.map((asset, index) => [asset.id, index + 1]))
}

/**
 * Footage the noise reduction applies to: the chosen assets in footage order.
 * An empty or stale selection means every footage asset, matching the backend contract.
 */
export function cleanupFootageIDs(footage: StoryAsset[], assetIDs: readonly string[] = []) {
  const chosen = new Set(assetIDs)
  const selected = footage.filter((asset) => chosen.has(asset.id)).map((asset) => asset.id)
  return selected.length > 0 ? selected : footage.map((asset) => asset.id)
}

/**
 * The asset_ids to save after toggling one footage asset. The last selected asset cannot be
 * removed, because an empty list would silently mean "all footage".
 */
export function toggleCleanupFootage(
  footage: StoryAsset[],
  assetIDs: readonly string[] | undefined,
  id: string
): string[] {
  const current = cleanupFootageIDs(footage, assetIDs)
  if (current.includes(id)) {
    return current.length === 1 ? current : current.filter((selected) => selected !== id)
  }
  const next = new Set([...current, id])
  return footage.filter((asset) => next.has(asset.id)).map((asset) => asset.id)
}
