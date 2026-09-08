'use client'

import { useAuth } from '@/components/auth/auth-guard'
import { Link } from '@/i18n/navigation'
import {
  type DashboardSectionKey,
  dashboardSectionHref,
  dashboardSections
} from '@/lib/dashboard-sections'
import { LayoutGroup, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function DashboardSection({
  section,
  activeTab,
  children
}: {
  section: DashboardSectionKey
  activeTab: string
  children: ReactNode
}) {
  const t = useTranslations('dashboardSections')
  const session = useAuth()
  const [navigationTarget, setNavigationTarget] = useState<HTMLElement | null>(
    null
  )
  useEffect(() => {
    setNavigationTarget(document.getElementById('studio-section-navigation'))
  }, [])
  const tabs =
    section === 'settings' && session.user?.deletion_pending
      ? ['account']
      : dashboardSections[section].tabs
  return (
    <>
      {navigationTarget &&
        createPortal(
          <LayoutGroup id={`section-${section}`}>
            <nav aria-label={t(section)} className="studio-section-tabs">
              {tabs.map((tab) => (
                <Link
                  key={tab}
                  href={dashboardSectionHref(section, tab)}
                  prefetch={false}
                  aria-label={t(tab)}
                  aria-current={tab === activeTab ? 'page' : undefined}
                  className={tab === activeTab ? 'is-active' : undefined}
                >
                  <span className="hidden sm:inline">{t(tab)}</span>
                  <span className="sm:hidden">
                    {t(
                      tab === 'brand'
                        ? 'brandShort'
                        : tab === 'billing'
                          ? 'billingShort'
                          : tab
                    )}
                  </span>
                  {tab === activeTab && (
                    <motion.span
                      aria-hidden="true"
                      layoutId="active-section"
                      className="studio-tab-indicator"
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                    />
                  )}
                </Link>
              ))}
            </nav>
          </LayoutGroup>,
          navigationTarget
        )}
      {children}
    </>
  )
}
