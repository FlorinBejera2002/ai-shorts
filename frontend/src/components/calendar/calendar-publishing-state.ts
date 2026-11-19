import type { PublishingTab } from './calendar-publishing-utils'
import { periodKinds, type PeriodKind } from './calendar-period'

export type SavedPeriod = { kind: PeriodKind; start: string; end: string }

type PublishingViewState = {
  period?: SavedPeriod
  selectedDate?: string
  tab?: PublishingTab
  selectedId?: string | null
  mobileDetail?: boolean
  scrollY?: number
  listScrollY?: number
}

const storageKey = 'sneepcut:publishing-view:v1'
const tabs: PublishingTab[] = [
  'all',
  'scheduled',
  'drafts',
  'published',
  'failed'
]

export function readPublishingView(): PublishingViewState {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? '{}'
    )
    if (!saved || typeof saved !== 'object') return {}
    const value = saved as PublishingViewState
    return {
      period: validPeriod(value.period),
      selectedDate: validDate(value.selectedDate),
      tab: tabs.includes(value.tab!) ? value.tab : 'scheduled',
      selectedId:
        typeof value.selectedId === 'string' ? value.selectedId : null,
      mobileDetail: value.mobileDetail === true,
      scrollY: validScroll(value.scrollY),
      listScrollY: validScroll(value.listScrollY)
    }
  } catch {
    return {}
  }
}

function validDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime())
    ? value
    : undefined
}

function validPeriod(value: unknown): SavedPeriod | undefined {
  if (!value || typeof value !== 'object') return undefined
  const period = value as Partial<SavedPeriod>
  if (!periodKinds.includes(period.kind as PeriodKind)) return undefined
  if (validDate(period.start) === undefined || validDate(period.end) === undefined)
    return undefined
  return { kind: period.kind as PeriodKind, start: period.start!, end: period.end! }
}

function validScroll(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0
}

export function savePublishingView(patch: PublishingViewState) {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ ...readPublishingView(), ...patch })
    )
  } catch {
    // Navigation remains available when browser storage is disabled or full.
  }
}

export function rememberPublishingScroll() {
  savePublishingView({ scrollY: window.scrollY })
}
