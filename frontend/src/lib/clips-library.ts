export const CLIPS_PAGE_SIZE = 24
export const CLIP_SCORE_FILTERS = ['all', 'high', 'promising', 'low'] as const
export const CLIP_ASPECT_FILTERS = ['all', '9:16', '1:1', '16:9'] as const
export const CLIP_SUBTITLE_FILTERS = ['all', 'yes', 'no'] as const
export const CLIP_SORTS = ['newest', 'oldest', 'score', 'duration'] as const

export type ClipScoreFilter = (typeof CLIP_SCORE_FILTERS)[number]
export type ClipAspectFilter = (typeof CLIP_ASPECT_FILTERS)[number]
export type ClipSubtitleFilter = (typeof CLIP_SUBTITLE_FILTERS)[number]
export type ClipSort = (typeof CLIP_SORTS)[number]

export type ClipsLibraryQuery = {
  search: string
  score: ClipScoreFilter
  aspect: ClipAspectFilter
  subtitles: ClipSubtitleFilter
  sort: ClipSort
  page: number
}

type QueryValue = string | string[] | undefined

function first(value: QueryValue) {
  return Array.isArray(value) ? value[0] : value
}

function oneOf<T extends string>(
  value: QueryValue,
  allowed: readonly T[],
  fallback: T
): T {
  const candidate = first(value)
  return candidate && allowed.includes(candidate as T)
    ? (candidate as T)
    : fallback
}

export function parseClipsLibraryQuery(
  values: Record<string, QueryValue>
): ClipsLibraryQuery {
  const rawPage = first(values.page)
  const page = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : 1

  return {
    search: (first(values.search) ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80),
    score: oneOf(values.score, CLIP_SCORE_FILTERS, 'all'),
    aspect: oneOf(values.aspect, CLIP_ASPECT_FILTERS, 'all'),
    subtitles: oneOf(values.subtitles, CLIP_SUBTITLE_FILTERS, 'all'),
    sort: oneOf(values.sort, CLIP_SORTS, 'newest'),
    page: Number.isSafeInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1
  }
}

export function clipsLibraryHref(
  query: ClipsLibraryQuery,
  overrides: Partial<ClipsLibraryQuery> = {}
) {
  const next = { ...query, ...overrides }
  const params = new URLSearchParams()
  if (next.search) params.set('search', next.search)
  if (next.score !== 'all') params.set('score', next.score)
  if (next.aspect !== 'all') params.set('aspect', next.aspect)
  if (next.subtitles !== 'all') params.set('subtitles', next.subtitles)
  if (next.sort !== 'newest') params.set('sort', next.sort)
  if (next.page > 1) params.set('page', String(next.page))
  const suffix = params.toString()
  return `/dashboard/clips${suffix ? `?${suffix}` : ''}`
}

export function hasActiveClipFilters(query: ClipsLibraryQuery) {
  return Boolean(
    query.search ||
      query.score !== 'all' ||
      query.aspect !== 'all' ||
      query.subtitles !== 'all' ||
      query.sort !== 'newest'
  )
}
