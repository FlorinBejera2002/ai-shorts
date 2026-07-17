import { Link } from '@/i18n/navigation'
import { Play, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface ClipPreview {
  id: string
  title: string
  duration: number
  viralScore: number
  fileUrl: string | null
  resolution: string
}

export function RecentClips({ clips }: { clips: ClipPreview[] }) {
  const t = useTranslations('dashboard')

  if (clips.length === 0) return null

  const getScoreColor = (score: number) => {
    if (score >= 80)
      return 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
    if (score >= 60)
      return 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
    return 'bg-slate-500/15 text-slate-600 border border-slate-500/30'
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('recentClips')}
        </h2>
        <Link
          href="/dashboard/clips"
          className="text-xs font-semibold text-primary transition-colors hover:text-primary/80"
        >
          {t('viewAll')} →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clips.slice(0, 6).map((clip, i) => (
          <Link
            key={clip.id}
            href={`/dashboard/clips/${clip.id}`}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 animate-slide-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="relative aspect-video overflow-hidden bg-muted">
              {clip.fileUrl && (
                <video
                  src={clip.fileUrl}
                  muted={true}
                  preload="metadata"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover:bg-black/30">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-lg opacity-0 transition-all duration-300 scale-75 group-hover:opacity-100 group-hover:scale-100">
                  <Play
                    className="h-4 w-4 text-black ml-0.5"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 px-3 py-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-semibold text-foreground truncate">
                  {clip.title}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {Math.round(clip.duration)}s
                </p>
              </div>
              {clip.viralScore > 0 && (
                <div
                  className={`inline-flex items-center gap-1 w-fit rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums ${getScoreColor(clip.viralScore)}`}
                >
                  <Zap className="h-3 w-3" />
                  {clip.viralScore}/10
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
