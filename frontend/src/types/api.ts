import type {
  BillingInvoice,
  BillingSubscription,
  CheckoutVerification,
  PaidBillingPlanId
} from '@/lib/billing'
import type { ActivityDay, ProjectStatus } from '@/lib/dashboard-activity'
import type { Clip, Job } from './index'

export type FullClip = Clip & {
  captionTiktok: string | null
  captionInstagram: string | null
  captionYoutube: string | null
  suggestedHashtags: string | null
}
export type ApiClip = Record<string, unknown>
/** The editor keeps its existing snake_case transport; views use camelCase. */
export function normalizeClip(raw: ApiClip): FullClip {
  const camel = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, character: string) =>
        character.toUpperCase()
      ),
      value
    ])
  )
  return {
    captionTiktok: null,
    captionInstagram: null,
    captionYoutube: null,
    suggestedHashtags: null,
    ...camel
  } as unknown as FullClip
}
export type DashboardData = {
  metrics: {
    activity: ActivityDay[]
    statuses: Record<ProjectStatus, number>
    jobCount: number
    clipCount: number
    durationMinutes: number
    credits: number
    plan: string
  }
  recentClips: FullClip[]
}
export type AnalyticsData = {
  jobs: { id: string; status: string; createdAt: string }[]
  clips: {
    id: string
    duration: number
    viralScore: number | null
    createdAt: string
  }[]
}
export type HistoryJob = Omit<Job, 'status'> & {
  status: string
  sourceFilePath: string | null
  _count: { clips: number }
}
export type ReviewClip = FullClip & {
  job: {
    sourceUrl: string | null
    sourceFilePath: string | null
    status: string
  }
}
export type ClipLibraryData = {
  clips: FullClip[]
  total: number
  currentPage: number
  totalPages: number
}
export type BillingPlanPrice = { amount: number; currency: string }
export type PlanCatalog = Partial<Record<PaidBillingPlanId, BillingPlanPrice>>
export type BillingData = {
  account: { credits: number; plan: string; hasBillingProfile: boolean }
  subscription: BillingSubscription | null
  invoices: BillingInvoice[]
  providerAvailable: boolean
  checkoutVerification: CheckoutVerification | { status: 'unavailable' } | null
}
