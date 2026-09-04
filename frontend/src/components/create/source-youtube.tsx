'use client'

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
    <div className="mt-5 animate-scale-in border-t border-border pt-5">
      <label className="section-label" htmlFor="youtube-url">
        {t('youtubeUrl')}
      </label>
      <div className="relative mt-3">
        <input
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
        <div className="panel-soft mt-4 flex items-center gap-3 p-3 animate-slide-up sm:gap-4">
          <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-black sm:w-36">
            <Image
              src={youtubeThumbnailUrl(videoId)}
              alt=""
              fill={true}
              sizes="144px"
              unoptimized={true}
              className="object-cover"
            />
            <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/70">
              <Youtube className="h-3 w-3 text-white" strokeWidth={1.75} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">
              {meta?.title ?? t('videoDetected')}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {meta?.author || `youtube.com/watch?v=${videoId}`}
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-[11px] font-medium text-success">
              <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
              {t('readyToProcess')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
