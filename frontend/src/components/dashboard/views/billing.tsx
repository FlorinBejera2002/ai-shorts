'use client'

import { useAuth } from '@/components/auth/use-auth'
import { BillingInitialState } from '@/components/billing/billing-initial-state'
import { BillingPageHeader } from '@/components/billing/billing-page-header'
import {
  BillingWorkspaceViews,
  type BillingView
} from '@/components/billing/billing-workspace-views'
import { useBillingResource } from '@/components/billing/use-billing-resource'
import { usePlanCatalog } from '@/components/billing/use-plan-catalog'
import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { normalizeBillingLocale } from '@/lib/billing'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState, type ReactNode } from 'react'
import styles from '@/components/billing/billing-page.module.css'
import theme from '@/components/calendar/publishing-theme.module.css'

function BillingFrame({
  children,
  view = 'overview'
}: {
  children: ReactNode
  view?: BillingView
}) {
  return (
    <div
      className={`${theme.surface} ${styles.workspace}`}
      data-reference-surface=""
      data-billing-workspace=""
      data-view={view}
    >
      <WorkspaceMobileHeader />
      {children}
    </div>
  )
}

function BillingLoading() {
  const t = useTranslations('billing.workspaceDesign')
  return (
    <BillingFrame>
      <BillingPageHeader title={t('title')} onBack={() => {}} />
      <BillingInitialState />
    </BillingFrame>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingLoading />}>
      <BillingPageContent />
    </Suspense>
  )
}

function BillingPageContent() {
  const locale = normalizeBillingLocale(useLocale())
  const t = useTranslations('billing')
  const { user: authenticatedUser } = useAuth()
  const search = useSearchParams()
  const billingSearch = new URLSearchParams(search)
  billingSearch.delete('tab')
  const resource = useBillingResource('/api/stripe/billing?' + billingSearch)
  const planCatalog = usePlanCatalog()
  const [view, setView] = useState<BillingView>('overview')
  const { data, error, reload, recovering } = resource
  const unlimited =
    data?.account.creditsUnlimited ?? authenticatedUser?.access_role === 'admin'
  const currentView = unlimited && view === 'plans' ? 'overview' : view
  const titles = {
    overview: t('workspaceDesign.title'),
    plans: t('workspaceDesign.changePlan'),
    invoices: t('invoicesTitle'),
    details: t('sectionDesign.billingDetails')
  }

  function navigate(next: BillingView) {
    setView(next)
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>(
        '[data-billing-title]'
      )
      heading?.focus({ preventScroll: true })
      heading?.scrollIntoView({ block: 'start' })
    })
  }

  return (
    <BillingFrame view={currentView}>
      <BillingPageHeader
        title={titles[currentView]}
        detail={currentView !== 'overview'}
        onBack={() => navigate('overview')}
        onRefresh={
          data && currentView === 'overview' ? () => void reload() : undefined
        }
        refreshing={recovering}
      />
      {data ? (
        <BillingWorkspaceViews
          data={data}
          resource={resource}
          locale={locale}
          unlimited={unlimited}
          view={currentView}
          planCatalog={planCatalog}
          canceled={billingSearch.get('canceled') === 'true'}
          onNavigate={navigate}
        />
      ) : (
        <BillingInitialState
          error={Boolean(error)}
          retry={() => void reload()}
        />
      )}
    </BillingFrame>
  )
}
