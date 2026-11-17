import type { PublishingTab } from './calendar-publishing-utils'

type PublishingViewState = {
  month?: string
  selectedDate?: string
  tab?: PublishingTab
  selectedId?: string | null
  mobileDetail?: boolean
  scrollY?: number
  listScrollY?: number
}

const storageKey = 'sneepcut:publishing-view:v1'
const tabs: PublishingTab[] = ['all', 'scheduled', 'drafts', 'published']

export function readPublishingView(): PublishingViewState {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? '{}'
    )
    if (!saved || typeof saved !== 'object') return {}
    const value = saved as PublishingViewState
    return {
      month: validDate(value.month),
      selectedDate: validDate(value.selectedDate),
      tab: tabs.includes(value.tab!) ? value.tab : 'all',
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
