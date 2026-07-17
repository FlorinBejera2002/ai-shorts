import { Link } from '@/i18n/navigation'
import { Film, Play } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export default async function ClipsPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('clips')

  const session = await auth()
  const clips = session?.user?.id
    ? await prisma.clip.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    : []

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('count', { count: clips.length })}
      />

      {clips.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clips.map((clip, i) => (
            <Link
              key={clip.id}
              href={`/dashboard/clips/${clip.id}`}
              className="group relative flex flex-col rounded-xl bg-card border border-border overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 animate-slide-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="aspect-video bg-muted relative overflow-hidden">
                {clip.fileUrl ? (
                  <video
                    src={clip.fileUrl}
                    muted={true}
                    preload="metadata"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100 shadow-lg">
                    <Play
                      className="w-5 h-5 text-black ml-0.5"
                      fill="currentColor"
                    />
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[13px] font-semibold truncate text-foreground">
                      {clip.title}
                    </h2>
                  </div>
                  {clip.viralScore > 0 && (
                    <div className="shrink-0 flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary tabular-nums whitespace-nowrap">
                      <span>🔥</span>
                      {clip.viralScore}/10
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span>{Math.round(clip.duration)}s</span>
                  <span className="text-border">·</span>
                  <span>{clip.resolution}</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-12">
          <EmptyState
            icon={Film}
            title={t('noClips')}
            description={t('count', { count: 0 })}
            action={
              <Link
                href="/dashboard/create"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t('firstProject')}
              </Link>
            }
          />
        </div>
      )}
    </div>
  )
}
