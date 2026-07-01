import { Play } from 'lucide-react'
import { Link } from '@/i18n/navigation'
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('recentClips')}
        </h2>
        <Link
          href="/dashboard/clips"
          className="text-xs font-medium text-primary hover:underline underline-offset-4"
        >
          {t('viewAll')}
        </Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clips.slice(0, 6).map((clip, i) => (
          <Link
            key={clip.id}
            href={`/dashboard/clips/${clip.id}`}
            className="group relative rounded-xl bg-card border border-border overflow-hidden transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 animate-slide-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="aspect-video bg-muted relative overflow-hidden">
              {clip.fileUrl && (
                <video
                  src={clip.fileUrl}
                  muted={true}
                  preload="metadata"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                  <Play className="w-3 h-3 text-black ml-0.5" fill="currentColor" />
                </div>
              </div>
            </div>
            <div className="px-2.5 py-2">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-medium truncate">{clip.title}</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {Math.round(clip.duration)}s
                  </p>
                </div>
                {clip.viralScore > 0 && (
                  <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                    {clip.viralScore}/10
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
