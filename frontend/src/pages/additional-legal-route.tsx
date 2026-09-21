import { documents } from '../routing/legal-documents'
import { LegalPageView } from '@/components/landing/legal-page-view'
import type { SiteLocale } from '@/lib/site-config'
import { useLocale, useTranslations } from 'next-intl'
import type { ComponentProps } from 'react'

export function AdditionalLegalRoute({ page }: { page: keyof typeof documents }) {
  const locale = useLocale() as SiteLocale
  const t = useTranslations('landing')
  return <LegalPageView copy={documents[page][locale]} t={t as unknown as ComponentProps<typeof LegalPageView>['t']} />
}
