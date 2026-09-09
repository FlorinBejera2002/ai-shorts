import { getTranslations, setRequestLocale } from 'next-intl/server'
import { HomePageView } from './home-page-view'

export default async function HomePage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <HomePageView locale={locale} t={t} />
}
