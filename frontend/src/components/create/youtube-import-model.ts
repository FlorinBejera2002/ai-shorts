/** Item states the progress card reports for each selected video. */
export type YouTubeImportItemStatus = 'waiting' | 'importing' | 'processing' | 'missing' | 'failed'

export interface YouTubeImportItem {
  video_id: string
  title: string
  /** Empty string when YouTube has no thumbnail for the video. */
  thumbnail_url: string
  status: YouTubeImportItemStatus
  job_id: string | null
  error: string
}

export interface YouTubeImportSelection {
  items: YouTubeImportItem[]
}

export interface YouTubeImport {
  id: string
  /** Import-level state from the server (authorizing, queued, exporting, importing, ready, failed, cancelled). */
  status: string
  /** Import-level error message; empty when none. */
  error: string
  selection: YouTubeImportSelection | null
}

/** Why the selection request was refused, mapped from its status code and body. */
export type SelectionFailure =
  | { kind: 'limit' }
  | { kind: 'connect' }
  | { kind: 'active' }
  | { kind: 'invalid-videos'; videoIds: string[] }
  | { kind: 'invalid-selection' }
  | { kind: 'invalid-options' }
  | { kind: 'invalid-request' }
  | { kind: 'rate-limited' }
  | { kind: 'forbidden' }
  | { kind: 'unavailable' }
  | { kind: 'generic' }

const CONNECT_MESSAGE = /connect your youtube channel/i
const ACTIVE_MESSAGE = /already in progress/i
// The 400 that names the selection rules (count and disclosure), as opposed to a malformed body.
const SELECTION_RULE_MESSAGE = /accept the import disclosure|between 1 and 10/i

/**
 * Classifies a refused POST /api/youtube/imports/selection. The server answers in English, so its
 * messages are read here and never shown. A 400 is either the selection rules or a malformed body.
 * A 422 names the refused videos when they are the problem and is otherwise an invalid clip option.
 * The 409 branch reads its two known messages.
 */
export function classifySelectionFailure(status: number, body: unknown): SelectionFailure {
  const message = readErrorMessage(body)
  switch (status) {
    case 402:
      return { kind: 'limit' }
    case 400:
      return SELECTION_RULE_MESSAGE.test(message) ? { kind: 'invalid-selection' } : { kind: 'invalid-request' }
    case 422: {
      const videoIds = readVideoIds(body)
      return videoIds.length > 0 ? { kind: 'invalid-videos', videoIds } : { kind: 'invalid-options' }
    }
    case 409:
      if (CONNECT_MESSAGE.test(message)) return { kind: 'connect' }
      if (ACTIVE_MESSAGE.test(message)) return { kind: 'active' }
      return { kind: 'generic' }
    case 403:
      return { kind: 'forbidden' }
    case 429:
      return { kind: 'rate-limited' }
    case 502:
    case 503:
      return { kind: 'unavailable' }
    default:
      return { kind: 'generic' }
  }
}

function readErrorMessage(body: unknown): string {
  if (typeof body !== 'object' || body === null) return ''
  const error = (body as { error?: unknown }).error
  return typeof error === 'string' ? error : ''
}

function readVideoIds(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return []
  const ids = (body as { video_ids?: unknown }).video_ids
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

/** Import states that still move on the server. Ready, failed and cancelled imports are final. */
const ACTIVE_IMPORT_STATUSES: readonly string[] = ['authorizing', 'queued', 'exporting', 'importing']

export function isImportActive(status: string): boolean {
  return ACTIVE_IMPORT_STATUSES.includes(status)
}

/** Waiting and importing items still move on the server, so the card keeps polling for them. */
export function isImportItemPending(item: YouTubeImportItem): boolean {
  return item.status === 'waiting' || item.status === 'importing'
}

/** Missing and failed items will not produce a job; the card reports them as unavailable. */
export function isImportItemUnavailable(item: YouTubeImportItem): boolean {
  return item.status === 'failed' || item.status === 'missing'
}

/**
 * The import the progress card is about: the newest one that carries a selection or is still
 * running. A finished import without a selection (for example one refused as "already in progress")
 * never replaces the card's subject.
 */
export function trackedImport(imports: readonly YouTubeImport[]): YouTubeImport | null {
  return imports.find((entry) => entry.selection !== null || isImportActive(entry.status)) ?? null
}

/**
 * The items the card lists. A final import will not move its items again, so any item still
 * waiting or importing reads as unavailable instead of staying "in progress" forever.
 */
export function progressItems(imports: readonly YouTubeImport[]): YouTubeImportItem[] {
  const entry = trackedImport(imports)
  if (!entry?.selection) return []
  const items = entry.selection.items
  if (isImportActive(entry.status)) return items
  return items.map((item) => (isImportItemPending(item) ? { ...item, status: 'missing' } : item))
}

/** Every item failed or is missing, so the card reads as an incomplete import. */
export function importIncomplete(items: readonly YouTubeImportItem[]): boolean {
  return items.length > 0 && items.every(isImportItemUnavailable)
}

/**
 * The card polls only while the tracked import is still running and has something left to do: an
 * import without a selection yet, or items still waiting or importing. Other imports never keep it busy.
 */
export function importNeedsPolling(imports: readonly YouTubeImport[]): boolean {
  const entry = trackedImport(imports)
  if (!entry || !isImportActive(entry.status)) return false
  return entry.selection === null || entry.selection.items.some(isImportItemPending)
}

export type ImportProgressPhase = 'checking' | 'importing' | 'ready' | 'partial' | 'incomplete'

/**
 * The progress card's phase. `imports` is undefined until the first read. A list that could not be
 * read before any data arrived reads as incomplete; a later failed refetch keeps the last phase.
 */
export function importProgressPhase(imports: readonly YouTubeImport[] | undefined, errored: boolean): ImportProgressPhase {
  if (imports === undefined) return errored ? 'incomplete' : 'checking'
  const entry = trackedImport(imports)
  if (!entry) return 'incomplete'
  if (!entry.selection) return isImportActive(entry.status) ? 'importing' : 'incomplete'
  if (entry.status === 'failed' || entry.status === 'cancelled') return 'incomplete'
  const items = progressItems(imports)
  if (items.length === 0 || importIncomplete(items)) return 'incomplete'
  if (items.some(isImportItemPending)) return 'importing'
  if (items.some(isImportItemUnavailable)) return 'partial'
  return 'ready'
}

/** Reads the `imports` array of GET /api/youtube/imports, dropping malformed entries. */
export function parseYouTubeImports(payload: unknown): YouTubeImport[] {
  if (typeof payload !== 'object' || payload === null) return []
  const list = (payload as { imports?: unknown }).imports
  if (!Array.isArray(list)) return []
  return list.flatMap((entry): YouTubeImport[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as { id?: unknown; status?: unknown; error?: unknown; selection?: unknown }
    return [
      {
        id: typeof record.id === 'string' ? record.id : '',
        status: typeof record.status === 'string' ? record.status : '',
        error: typeof record.error === 'string' ? record.error : '',
        selection: parseSelection(record.selection)
      }
    ]
  })
}

function parseSelection(value: unknown): YouTubeImportSelection | null {
  if (typeof value !== 'object' || value === null) return null
  const items = (value as { items?: unknown }).items
  if (!Array.isArray(items)) return null
  return { items: items.flatMap(parseItem) }
}

const ITEM_STATUSES: readonly YouTubeImportItemStatus[] = ['waiting', 'importing', 'processing', 'missing', 'failed']

function parseItem(value: unknown): YouTubeImportItem[] {
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  const status = record.status
  if (typeof record.video_id !== 'string' || !ITEM_STATUSES.includes(status as YouTubeImportItemStatus)) return []
  return [
    {
      video_id: record.video_id,
      title: typeof record.title === 'string' ? record.title : '',
      thumbnail_url: typeof record.thumbnail_url === 'string' ? record.thumbnail_url : '',
      status: status as YouTubeImportItemStatus,
      job_id: typeof record.job_id === 'string' ? record.job_id : null,
      error: typeof record.error === 'string' ? record.error : ''
    }
  ]
}
