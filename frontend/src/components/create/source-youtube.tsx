'use client'

import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { AlertCircle, CheckCircle2, X, Youtube } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useEffect, useState } from 'react'

import {
  extractYouTubeId,
  fetchYouTubeMeta,
  youtubeThumbnailUrl
} from '@/lib/youtube'

interface SourceYoutubeProps {
  url: string
  onChange: (url: string) => void
}

export function SourceYoutube({ url, onChange }: SourceYoutubeProps) {
  const t = useTranslations('create')
  const videoId = extractYouTubeId(url)
  const isInvalid = url.trim().length > 0 && !videoId
  const [meta, setMeta] = useState<{ title: string; author: string } | null>(
    null
  )

  useEffect(() => {
    setMeta(null)
    if (!videoId) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void fetchYouTubeMeta(url, controller.signal).then((m) => {
        if (!controller.signal.aborted) setMeta(m)
      })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [videoId, url])

  return (
    <div className="animate-scale-in">
      <Label className="section-label" htmlFor="youtube-url">
        {t('youtubeUrl')}
      </Label>
      <div className="relative mt-3">
        <Input
          id="youtube-url"
          value={url}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('youtubeUrlPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={isInvalid}
          className={`w-full rounded-xl border bg-background py-3 pl-4 pr-10 text-[13px] text-foreground placeholder:text-muted-foreground/55 transition-all outline-none focus:ring-2 ${
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
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
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

      {videoId && (
        <Card
          className="mt-4 flex flex-col items-stretch gap-4 rounded-xl bg-muted/20 p-4 shadow-none animate-slide-up sm:flex-row sm:items-center sm:gap-5"
          data-testid="youtube-preview"
        >
          <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-44">
            <Image
              src={youtubeThumbnailUrl(videoId)}
              alt=""
              fill={true}
              sizes="(min-width: 640px) 176px, 100vw"
              unoptimized={true}
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Youtube
                className="h-3.5 w-3.5 text-destructive"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              YouTube
            </span>
            <p
              className="line-clamp-2 break-words text-sm font-semibold leading-relaxed text-foreground"
              title={meta?.title}
            >
              {meta?.title ?? t('videoDetected')}
            </p>
            <p
              className="mt-1 truncate text-xs text-muted-foreground"
              title={meta?.author}
            >
              {meta?.author || `youtube.com/watch?v=${videoId}`}
            </p>
            <span
              role="status"
              className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-success/15 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success"
            >
              <CheckCircle2
                className="h-3.5 w-3.5 shrink-0"
                strokeWidth={2}
                aria-hidden="true"
              />
              {t('readyToProcess')}
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}
