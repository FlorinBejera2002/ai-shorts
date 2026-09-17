'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useToast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/auth'
import {
  Captions,
  Download,
  ExternalLink,
  Film,
  Folder,
  Pencil,
  Play,
  Send,
  Trash2,
  Zap
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
  fileUrl?: string | null
  createdAt: string
}

type ClipCardActions = {
  edit: string
  publish: string
  download: string
  delete: string
  deleteConfirm: string
  deleteSuccess: string
  deleteError: string
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

function formatClipDate(value: string, locale: string) {
  let formatter = dateFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
    dateFormatters.set(locale, formatter)
  }
  return formatter.format(new Date(value))
}

export function ClipCard({
  clip,
  locale,
  labels,
  index,
  href,
  actionLabel,
  projectName,
  actions,
  onDeleted
}: {
  clip: ClipCardData
  locale: string
  labels: { open: string; score: string; subtitles: string }
  index: number
  href?: string
  actionLabel?: string
  projectName?: string | null
  actions?: ClipCardActions
  onDeleted?: () => void | Promise<void>
}) {
  const router = useRouter()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const clipHref = href ?? `/dashboard/clips/${clip.id}`
  const date = formatClipDate(clip.createdAt, locale)

  async function deleteClip() {
    if (!actions || !window.confirm(actions.deleteConfirm)) return
    setDeleting(true)
    try {
      const response = await apiFetch(`/api/clips/${clip.id}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        toast.add('error', data.error ?? actions.deleteError)
        return
      }
      toast.add('success', actions.deleteSuccess)
      await onDeleted?.()
      router.refresh()
    } catch {
      toast.add('error', actions.deleteError)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card
      style={{ animationDelay: `${Math.min(index, 10) * 25}ms` }}
      className="media-asset group min-w-0 gap-0 overflow-hidden py-0 shadow-none transition-colors hover:border-primary/50"
    >
      <div
        className="relative flex h-full min-w-0 flex-col rounded-md"
        style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
      >
        <Link
          href={clipHref}
          className="media-asset-preview relative block aspect-video overflow-hidden border-b outline-none"
          aria-label={`${labels.open}: ${clip.title}`}
        >
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
        </Link>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug">
              <Link href={clipHref} className="outline-none hover:underline">
                {clip.title}
              </Link>
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
            {projectName && (
              <span className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground/75">
                <Folder className="size-3 shrink-0" aria-hidden="true" />
                <span className="max-w-28 truncate">{projectName}</span>
              </span>
            )}
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
          {actionLabel && (
            <Link
              href={clipHref}
              className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white transition-colors hover:bg-black/85"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {actionLabel}
            </Link>
          )}
          {actions && (
            <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-border/70 pt-3">
              <CardAction
                href={`/dashboard/clips/${clip.id}/edit`}
                label={actions.edit}
                icon={Pencil}
              />
              <CardAction
                href={`/dashboard/publish/new?clip=${encodeURIComponent(clip.id)}`}
                label={actions.publish}
                icon={Send}
                primary={true}
              />
              {clip.fileUrl ? (
                <a
                  href={clip.fileUrl}
                  download={true}
                  aria-label={actions.download}
                  title={actions.download}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-semibold text-foreground transition-[border-color,color] hover:border-foreground/35"
                >
                  <Download className="size-4" aria-hidden="true" />
                  <span>{actions.download}</span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled={true}
                  aria-label={actions.download}
                  title={actions.download}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-semibold text-muted-foreground opacity-40"
                >
                  <Download className="size-4" aria-hidden="true" />
                  <span>{actions.download}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void deleteClip()}
                disabled={deleting}
                aria-label={actions.delete}
                title={actions.delete}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-transparent bg-background px-2 text-[11px] font-semibold text-destructive/80 transition-[border-color,color] hover:border-destructive/25 hover:text-destructive disabled:opacity-50"
              >
                {deleting ? (
                  <LoadingIndicator className="size-4" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
                <span>{actions.delete}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function CardAction({
  href,
  label,
  icon: Icon,
  primary = false
}: {
  href: string
  label: string
  icon: typeof Pencil
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-[border-color,color,opacity] ${
        primary
          ? 'border-foreground bg-foreground text-background hover:opacity-85'
          : 'border-border bg-background text-foreground hover:border-foreground/35'
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  )
}
