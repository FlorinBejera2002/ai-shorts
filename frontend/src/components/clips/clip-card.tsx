import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { Captions, Film, Play, Zap } from 'lucide-react'

export type ClipCardData = {
  id: string
  title: string
  hookText: string | null
  duration: number
  viralScore: number
  resolution: string
  aspectRatio: string
  hasSubtitles: boolean
  thumbnailUrl: string | null
  createdAt: string
}

export function ClipCard({
  clip,
  locale,
  labels,
  index
}: {
  clip: ClipCardData
  locale: string
  labels: { open: string; score: string; subtitles: string }
  index: number
}) {
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(clip.createdAt))

  return (
    <Card
      style={{ animationDelay: `${Math.min(index, 10) * 25}ms` }}
      className="media-asset group min-w-0 gap-0 overflow-hidden py-0 shadow-none transition-colors hover:border-primary/50"
    >
      <Link
        href={`/dashboard/clips/${clip.id}`}
        className="relative flex h-full min-w-0 flex-col rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
        aria-label={`${labels.open}: ${clip.title}`}
      >
        <div className="media-asset-preview relative aspect-video overflow-hidden border-b">
          {clip.thumbnailUrl ? (
            <img
              src={clip.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Film className="h-9 w-9 text-slate-500" aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
            <div className="flex h-10 w-10 scale-90 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-lg transition-all group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100">
              <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
            </div>
          </div>
          <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            {Math.round(clip.duration)}s · {clip.aspectRatio}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug">
              {clip.title}
            </h2>
            {clip.viralScore > 0 && (
              <Badge
                variant="secondary"
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold tabular-nums ${
                  clip.viralScore >= 8
                    ? 'bg-success/10 text-success'
                    : clip.viralScore >= 5
                      ? 'bg-warning/10 text-warning'
                      : 'bg-muted text-muted-foreground'
                }`}
                title={labels.score}
              >
                <Zap className="h-2.5 w-2.5" aria-hidden="true" />
                {clip.viralScore}/10
              </Badge>
            )}
          </div>
          {clip.hookText && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {clip.hookText}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-4 text-[11px] text-muted-foreground">
            <span>{date}</span>
            <span aria-hidden="true">·</span>
            <span>{clip.resolution}</span>
            {clip.hasSubtitles && (
              <span
                className="ml-auto inline-flex items-center gap-1"
                title={labels.subtitles}
              >
                <Captions className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{labels.subtitles}</span>
              </span>
            )}
          </div>
        </div>
      </Link>
    </Card>
  )
}
