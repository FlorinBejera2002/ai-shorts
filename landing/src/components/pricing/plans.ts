import type { PlanId } from '@/content/copy/types'

export const PLAN_ORDER: PlanId[] = ['free', 'creator', 'pro', 'agency']

export const PLAN_ILLUSTRATIONS: Record<PlanId, string> = {
  free: '/landing/illustrations/plan-free.webp',
  creator: '/landing/illustrations/plan-creator.webp',
  pro: '/landing/illustrations/plan-pro.webp',
  agency: '/landing/illustrations/plan-agency.webp'
}

export const FEATURED_PLAN: PlanId = 'pro'
