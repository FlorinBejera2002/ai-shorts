import { Share2 } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function PublishPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('publish')

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('desc')}
      </p>
      <div className="mt-10 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <Share2 className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {t('comingSoon')}
        </p>
      </div>
    </div>
  )
}
