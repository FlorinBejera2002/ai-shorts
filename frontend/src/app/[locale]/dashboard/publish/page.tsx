import { PublishingWorkspace } from '@/components/publishing/publishing-workspace'
import { setRequestLocale } from 'next-intl/server'

export default async function PublishPage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  return <PublishingWorkspace />
}
