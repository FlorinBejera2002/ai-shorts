import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Share2, Zap } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function PublishPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('publish')

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('title')} description={t('desc')} />

      <div className="mt-12">
        <EmptyState
          icon={Share2}
          title="Coming soon"
          description={t('comingSoon')}
          action={
            <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />
              Phase 6 – Direct publishing to social
            </div>
          }
        />
      </div>
    </div>
  )
}
