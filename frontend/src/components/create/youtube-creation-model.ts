/** Clip count sent as `num_clips_requested` when the backend should decide. */
export const AUTO_CLIP_COUNT = 0
export const MIN_CLIP_COUNT = 1
export const MAX_CLIP_COUNT = 30
export const CLIP_COUNT_PRESETS = [AUTO_CLIP_COUNT, 3, 5, 8] as const

/** Most channel videos one import may carry (the selection endpoint accepts 1..10). */
export const MAX_SELECTED_VIDEOS = 10

export const VISIBILITY_FILTERS = ['all', 'public', 'unlisted', 'private'] as const
export type LibraryVisibilityFilter = (typeof VISIBILITY_FILTERS)[number]

/** Keeps a clip count inside the 1..30 range the backend accepts. */
export function clampClipCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_CLIP_COUNT
  return Math.min(MAX_CLIP_COUNT, Math.max(MIN_CLIP_COUNT, Math.round(value)))
}

/** Parses the "Altul" field: null while the text is not a number, otherwise a clamped count. */
export function parseManualClipCount(text: string): number | null {
  const trimmed = text.trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  return clampClipCount(Number(trimmed))
}

export function isAutoClipCount(clips: number): boolean {
  return clips === AUTO_CLIP_COUNT
}

/** Maps the library visibility tab to the `visibility` query value of the channel videos API. */
export function visibilityQueryParam(filter: LibraryVisibilityFilter): LibraryVisibilityFilter {
  return VISIBILITY_FILTERS.includes(filter) ? filter : 'all'
}

/** Private videos cannot be exported, so their rows stay disabled in the channel list. */
export function isSelectableVideo(visibility: 'public' | 'unlisted' | 'private'): boolean {
  return visibility !== 'private'
}

/**
 * Toggles one video in the selection. Choosing a new video is ignored once the cap is reached;
 * removing one always works. Returns a new array so React state updates stay pure.
 */
export function toggleVideoSelection(selected: readonly string[], videoId: string): string[] {
  if (selected.includes(videoId)) return selected.filter((id) => id !== videoId)
  if (selected.length >= MAX_SELECTED_VIDEOS) return [...selected]
  return [...selected, videoId]
}

/** Accepts only Google's HTTPS sign-in page as the redirect target of a connection or export consent. */
export function isGoogleAuthorizationUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'accounts.google.com' && !url.port && !url.username && !url.password
  } catch {
    return false
  }
}

/**
 * Index of the filter a radio-group key moves to, or null for keys that do not move the selection.
 * Arrow keys wrap around, as in a native radio group.
 */
export function nextVisibilityFilterIndex(current: number, key: string): number | null {
  const count = VISIBILITY_FILTERS.length
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/**
 * A video refused by the backend stays disabled only while its visibility is the one it had when it
 * was refused. A visibility change (made on YouTube, then listed again) makes it choosable again.
 */
export function isRefusedVideo(refusedVisibility: string | undefined, visibility: string): boolean {
  return refusedVisibility !== undefined && refusedVisibility === visibility
}
