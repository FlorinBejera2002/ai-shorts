/**
 * Clips page data model: the `/api/projects` payload flattened into one clip list plus the
 * account's projects (collections), and the URL query that filters, sorts and pages it.
 * Pure functions only, so the page and the tests share one source of truth.
 */

export const CLIPS_PAGE_SIZE = 10
export const CLIPS_MOBILE_BATCH = 6
export const CLIP_ASPECTS = ['all', '9:16', '1:1', '16:9'] as const
export const CLIP_SUBTITLES = ['all', 'yes', 'no'] as const
export const CLIP_SORTS = ['newest', 'oldest', 'duration'] as const

export type ClipAspect = (typeof CLIP_ASPECTS)[number]
export type ClipSubtitles = (typeof CLIP_SUBTITLES)[number]
export type ClipSort = (typeof CLIP_SORTS)[number]
/** `all`, `favorites` (starred clips), `none` (clips outside every project) or a project id. */
export type ClipsScope = string

export type ClipsQuery = {
  search: string
  project: ClipsScope
  aspect: ClipAspect
  subtitles: ClipSubtitles
  sort: ClipSort
  page: number
}

export type ApiLibraryClip = {
  id: string
  folderId: string | null
  title: string
  duration: number
  aspectRatio: string
  thumbnailUrl: string | null
  fileUrl?: string | null
  hookText: string | null
  hasSubtitles: boolean
  favorite?: boolean
  createdAt: string
}

export type ApiLibrarySource = {
  id: string
  folders: { id: string; parentId: string | null; name: string }[]
  clips: ApiLibraryClip[]
}

export type ApiCollection = { id: string; name: string; createdAt?: string }

export type ClipsLibraryResponse = {
  projects: ApiLibrarySource[]
  collections?: ApiCollection[]
}

export type LibraryClip = {
  id: string
  title: string
  duration: number
  aspectRatio: string
  thumbnailUrl: string | null
  fileUrl: string | null
  hookText: string | null
  hasSubtitles: boolean
  favorite: boolean
  createdAt: string
  /** The project (root folder) the clip is filed in, or null. */
  collectionId: string | null
}

export type LibraryCollection = { id: string; name: string; count: number }

export type ClipsLibrary = {
  clips: LibraryClip[]
  collections: LibraryCollection[]
  unassigned: number
  favorites: number
}

/** Flattens every source video's clips and resolves each clip's project. */
export function buildClipsLibrary(data: ClipsLibraryResponse): ClipsLibrary {
  const parents = new Map<string, string | null>()
  for (const source of data.projects)
    for (const folder of source.folders) parents.set(folder.id, folder.parentId)
  const roots = new Set((data.collections ?? []).map((collection) => collection.id))
  function rootOf(folderId: string | null) {
    let current = folderId
    for (let depth = 0; current && depth < 32; depth += 1) {
      if (roots.has(current)) return current
      current = parents.get(current) ?? null
    }
    return null
  }
  const clips = data.projects
    .flatMap((source) => source.clips)
    .map((clip) => ({
      id: clip.id,
      title: clip.title,
      duration: clip.duration,
      aspectRatio: clip.aspectRatio,
      thumbnailUrl: clip.thumbnailUrl || null,
      fileUrl: clip.fileUrl || null,
      hookText: clip.hookText,
      hasSubtitles: clip.hasSubtitles,
      favorite: clip.favorite === true,
      createdAt: clip.createdAt,
      collectionId: rootOf(clip.folderId)
    }))
  const counts = new Map<string, number>()
  for (const clip of clips)
    if (clip.collectionId) counts.set(clip.collectionId, (counts.get(clip.collectionId) ?? 0) + 1)
  return {
    clips,
    collections: (data.collections ?? []).map((collection) => ({
      id: collection.id,
      name: collection.name,
      count: counts.get(collection.id) ?? 0
    })),
    unassigned: clips.filter((clip) => !clip.collectionId).length,
    favorites: clips.filter((clip) => clip.favorite).length
  }
}

type QueryValue = string | string[] | null | undefined

function first(value: QueryValue) {
  return Array.isArray(value) ? value[0] : (value ?? undefined)
}

function oneOf<T extends string>(value: QueryValue, allowed: readonly T[], fallback: T): T {
  const candidate = first(value)
  return candidate && allowed.includes(candidate as T) ? (candidate as T) : fallback
}

export function parseClipsQuery(values: Record<string, QueryValue>): ClipsQuery {
  const rawPage = first(values.page)
  const page = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : 1
  const project = first(values.project)
  return {
    search: (first(values.search) ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
    project: project && /^(none|favorites|[0-9a-f-]{36})$/i.test(project) ? project : 'all',
    aspect: oneOf(values.aspect, CLIP_ASPECTS, 'all'),
    subtitles: oneOf(values.subtitles, CLIP_SUBTITLES, 'all'),
    sort: oneOf(values.sort, CLIP_SORTS, 'newest'),
    page: Number.isSafeInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1
  }
}

/** `/dashboard/clips?…` for a query; defaults are left out so links stay short. */
export function clipsHref(query: ClipsQuery, changes: Partial<ClipsQuery> = {}) {
  const next = { ...query, page: 1, ...changes }
  const params = new URLSearchParams()
  if (next.project !== 'all') params.set('project', next.project)
  if (next.search) params.set('search', next.search)
  if (next.aspect !== 'all') params.set('aspect', next.aspect)
  if (next.subtitles !== 'all') params.set('subtitles', next.subtitles)
  if (next.sort !== 'newest') params.set('sort', next.sort)
  if (next.page > 1) params.set('page', String(next.page))
  const suffix = params.toString()
  return `/dashboard/clips${suffix ? `?${suffix}` : ''}`
}

export function activeClipFilters(query: ClipsQuery) {
  return [query.aspect !== 'all' && 'aspect', query.subtitles !== 'all' && 'subtitles'].filter(
    (name): name is 'aspect' | 'subtitles' => Boolean(name)
  )
}

/** Scopes that are lists of the library rather than one project. */
export function isClipsListScope(scope: ClipsScope) {
  return scope === 'all' || scope === 'none' || scope === 'favorites'
}

export function hasClipsRefinement(query: ClipsQuery) {
  return Boolean(query.search) || activeClipFilters(query).length > 0
}

/** Lowercases and drops diacritics, so "caretas" matches "Carețas". */
function searchable(text: string, locale: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale)
}

/** Clips in the selected scope that match the search and filters, in the chosen order. */
export function selectClips(clips: LibraryClip[], query: ClipsQuery, locale = 'en') {
  const search = searchable(query.search, locale)
  return clips
    .filter((clip) => {
      if (query.project === 'none' && clip.collectionId) return false
      if (query.project === 'favorites' && !clip.favorite) return false
      if (!isClipsListScope(query.project) && clip.collectionId !== query.project) return false
      if (search && !searchable(`${clip.title} ${clip.hookText ?? ''}`, locale).includes(search)) return false
      if (query.aspect !== 'all' && clip.aspectRatio !== query.aspect) return false
      if (query.subtitles === 'yes' && !clip.hasSubtitles) return false
      if (query.subtitles === 'no' && clip.hasSubtitles) return false
      return true
    })
    .sort((left, right) => {
      if (query.sort === 'duration') return right.duration - left.duration || newest(left, right)
      if (query.sort === 'oldest') return -newest(left, right)
      return newest(left, right)
    })
}

function newest(left: LibraryClip, right: LibraryClip) {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id)
}

/** The desktop page window: clamped page, its clips and the 1-based range shown. */
export function paginateClips<T>(items: T[], page: number, size = CLIPS_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * size
  return {
    items: items.slice(start, start + size),
    page: current,
    pages,
    from: items.length ? start + 1 : 0,
    to: Math.min(items.length, start + size)
  }
}

/** Page buttons with gaps: 1 … 4 5 6 … 12. */
export function pageWindow(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  const middle = [page - 1, page, page + 1].filter((value) => value > 1 && value < pages)
  const window: (number | 'gap')[] = [1]
  if (middle[0] > 2) window.push('gap')
  window.push(...middle)
  if (middle[middle.length - 1] < pages - 1) window.push('gap')
  window.push(pages)
  return window
}
