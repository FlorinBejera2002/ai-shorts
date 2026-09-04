import { Link } from '@/i18n/navigation'
import { Play, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface ClipPreview {
  id: string
  title: string
  duration: number
  viralScore: number
  fileUrl: string | null
  thumbnailUrl: string | null
  resolution: string
}

export function RecentClips({ clips }: { clips: ClipPreview[] }) {
  const t = useTranslations('dashboard')

  if (clips.length === 0) return null

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-success'
    if (score >= 6) return 'text-warning'
    return 'text-muted-foreground'
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-label">{t('recentClips')}</h2>
        <Link
          href="/dashboard/clips"
          className="text-xs font-semibold text-primary transition-colors hover:opacity-75"
        >
          {t('viewAll')} →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clips.slice(0, 6).map((clip, i) => (
          <Link
            key={clip.id}
            href={`/dashboard/clips/${clip.id}`}
            className="panel group relative flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 animate-slide-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="relative aspect-video overflow-hidden bg-muted">
              {clip.thumbnailUrl && (
                <img
                  src={clip.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-lg">
                  <Play
                    className="h-3.5 w-3.5 text-black ml-0.5"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                </div>
              </div>
              <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
                {Math.round(clip.duration)}s
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <h3 className="truncate text-xs font-semibold text-foreground">
                {clip.title}
              </h3>
              {clip.viralScore > 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums shrink-0 ${getScoreColor(clip.viralScore)}`}
                >
                  <Zap className="h-2.5 w-2.5" />
                  {clip.viralScore}/10
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
