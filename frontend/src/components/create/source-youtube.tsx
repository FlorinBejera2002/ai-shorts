'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'

import { AlertCircle, CheckCircle2, Info, X, Youtube } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useEffect, useState, type ReactNode } from 'react'

import {
  extractYouTubeId,
  fetchYouTubeMeta,
  youtubeThumbnailUrl
} from '@/lib/youtube'

interface SourceYoutubeProps {
  url: string
  onChange: (url: string) => void
  actions?: ReactNode
}

export function SourceYoutube({ url, onChange, actions }: SourceYoutubeProps) {
  const t = useTranslations('create')
  const videoId = extractYouTubeId(url)
  const isInvalid = url.trim().length > 0 && !videoId
  const [metadata, setMetadata] = useState<{
    url: string
    title: string
    author: string
  } | null>(null)
  const meta = metadata?.url === url ? metadata : null

  useEffect(() => {
    if (!videoId) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void fetchYouTubeMeta(url, controller.signal).then((m) => {
        if (!controller.signal.aborted) setMetadata(m ? { url, ...m } : null)
      })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [videoId, url])

  return (
    <div className="animate-scale-in">
      <div className="relative">
        <Label htmlFor="youtube-url" className="sr-only">
          {t('youtubeUrl')}
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="creation-source-info absolute right-[48px] top-0 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('youtubeSourceInfo')}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72" side="top" sideOffset={6}>
              {t('youtubeSourceInfo')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Input
          id="youtube-url"
          value={url}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('youtubeUrlPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={isInvalid}
          className={`min-h-11 w-full rounded-md border bg-background py-3 pl-4 pr-[96px] text-sm text-foreground placeholder:text-muted-foreground/55 transition-all outline-none focus:ring-2 ${
            isInvalid
              ? 'border-destructive/60 focus:border-destructive focus:ring-destructive/15'
              : 'border-input focus:border-primary focus:ring-primary/15'
          }`}
        />
        {url && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t('clearUrl')}
            className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {isInvalid && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {t('invalidYoutubeUrl')}
        </p>
      )}

      {actions}
      {videoId ? (
        <div
          className="creation-video-preview"
          data-testid="youtube-preview"
        >
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
            <Image
              src={youtubeThumbnailUrl(videoId)}
              alt=""
              fill={true}
              sizes="(min-width: 900px) 65vw, 100vw"
              unoptimized={true}
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="line-clamp-2 break-words text-lg font-semibold leading-snug text-foreground sm:text-xl"
              title={meta?.title}
            >
              {meta?.title ?? t('videoDetected')}
            </p>
            <div className="creation-video-meta">
              <p
                className="min-w-0 truncate text-sm text-muted-foreground"
                title={meta?.author}
              >
                {meta?.author || `youtube.com/watch?v=${videoId}`}
              </p>
              <span
                role="status"
                className="inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-muted-foreground"
              >
                <CheckCircle2
                  className="h-3.5 w-3.5 shrink-0 text-success"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {t('readyToProcess')}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="creation-source-empty" aria-hidden="true">
          <Youtube className="size-9" strokeWidth={1.25} />
        </div>
      )}
    </div>
  )
}
