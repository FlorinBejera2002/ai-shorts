import { type SiteLocale, buildLocaleMetadata } from '@/lib/site-config'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DataDeletionPageView } from './data-deletion-page-view'

export async function generateMetadata({
  params
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return buildLocaleMetadata(locale === 'ro' ? 'ro' : 'en', {
    path: '/data-deletion',
    title:
      locale === 'ro'
        ? 'Ștergerea datelor — Sneep Cut'
        : 'Data deletion — Sneep Cut',
    description:
      locale === 'ro'
        ? 'Deconectează conturile sociale și solicită ștergerea datelor Sneep Cut.'
        : 'Disconnect social accounts and request deletion of your Sneep Cut data.'
  })
}

export default async function DataDeletionPage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <DataDeletionPageView locale={locale} t={t} />
}
