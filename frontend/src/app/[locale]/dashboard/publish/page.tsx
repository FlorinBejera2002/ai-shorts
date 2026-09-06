import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Link } from '@/i18n/navigation'
import { ArrowUpRight, CalendarDays, Film, Share2 } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function PublishPage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('publish')
  const ro = locale === 'ro'
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('desc')} />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="grid lg:grid-cols-[1.2fr_.8fr]">
          <div className="p-6 sm:p-8">
            <Badge variant="outline" className="gap-2">
              <Share2 className="size-3.5" />
              {ro
                ? 'Publicare directă — în pregătire'
                : 'Direct publishing — coming soon'}
            </Badge>
            <h2 className="mt-6 text-2xl font-semibold leading-tight">
              {ro
                ? 'Pregătește conținutul pentru următoarea postare.'
                : 'Get your next post ready.'}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
              {t('comingSoon')}
            </p>
          </div>
          <div className="grid content-center gap-3 border-t bg-muted/30 p-6 lg:border-l lg:border-t-0">
            {['TikTok', 'Instagram Reels', 'YouTube Shorts', 'LinkedIn'].map(
              (platform) => (
                <div
                  key={platform}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  <span className="text-sm font-medium">{platform}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {ro ? 'Indisponibil' : 'Unavailable'}
                  </Badge>
                </div>
              )
            )}
          </div>
        </div>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        {[
          {
            href: '/dashboard/clips',
            Icon: Film,
            title: ro
              ? 'Alege și descarcă un clip'
              : 'Choose and download a clip',
            desc: ro
              ? 'Verifică subtitrările și descarcă varianta finală din bibliotecă.'
              : 'Review captions and download the final version from your library.',
            cta: ro ? 'Deschide biblioteca' : 'Open library'
          },
          {
            href: '/dashboard/calendar',
            Icon: CalendarDays,
            title: ro
              ? 'Organizează calendarul editorial'
              : 'Plan your content calendar',
            desc: ro
              ? 'Organizează postările și notițele. Planificarea nu publică automat conținutul.'
              : 'Organize posts and notes. Scheduling does not automatically publish content.',
            cta: ro ? 'Deschide calendarul' : 'Open calendar'
          }
        ].map(({ href, Icon, title, desc, cta }) => (
          <Card key={href} className="shadow-none">
            <CardHeader>
              <Icon className="mb-3 size-5 text-primary" />
              <CardTitle>
                <h2 className="text-lg leading-snug">{title}</h2>
              </CardTitle>
              <CardDescription className="leading-7">{desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild={true} variant="outline">
                <Link href={href}>
                  {cta}
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
