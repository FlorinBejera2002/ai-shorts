'use client'

import { Card } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { formatDuration } from '@/lib/utils'
import { Film, Play, TrendingUp } from 'lucide-react'
import type { ClipVariant } from '@/types'
import {
  ClipActionsMenu,
  type ClipCardActions,
  type ClipMoveTarget
} from './clip-actions-menu'
import styles from './clip-card.module.css'
import { useDeleteClip } from './use-delete-clip'

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
  variants?: ClipVariant[]
  createdAt: string
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
  projectName,
  actions,
  onDeleted,
  moveTargets = [],
  currentMoveTarget,
  onMove,
  moveLabel = 'Move to project',
  menuLabel,
  cancelLabel = 'Cancel'
}: {
  clip: ClipCardData
  locale: string
  labels: { open: string; score: string; subtitles: string }
  index: number
  projectName?: string | null
  actions?: ClipCardActions
  onDeleted?: () => void | Promise<void>
  moveTargets?: ClipMoveTarget[]
  currentMoveTarget?: string
  onMove?: (value: string) => void | Promise<void>
  moveLabel?: string
  menuLabel?: string
  cancelLabel?: string
}) {
  const clipHref = `/dashboard/clips/${encodeURIComponent(clip.id)}`
  const { deleting, deleteClip: removeClip } = useDeleteClip({
    clipId: clip.id,
    successMessage: actions?.deleteSuccess ?? '',
    errorMessage: actions?.deleteError ?? '',
    onDeleted
  })

  async function deleteClip() {
    if (!actions || !window.confirm(actions.deleteConfirm)) return
    await removeClip()
  }

  return (
    <Card
      as="article"
      data-clip-card={clip.id}
      className={`${styles.card} media-asset`}
      style={{ animationDelay: `${Math.min(index, 10) * 25}ms` }}
    >
      <Link
        href={clipHref}
        className={styles.preview}
        aria-label={`${labels.open}: ${clip.title}`}
      >
        {clip.thumbnailUrl ? (
          <img
            src={clip.thumbnailUrl}
            alt=""
            loading="lazy"
            className={styles.image}
          />
        ) : (
          <Film className={styles.fallback} aria-hidden="true" />
        )}
        <span className={styles.play}>
          <Play className="size-4 fill-current" aria-hidden="true" />
        </span>
        {clip.hasSubtitles && (
          <span className={styles.captions} title={labels.subtitles}>
            <span aria-hidden="true">CC</span>
            <span className="sr-only">{labels.subtitles}</span>
          </span>
        )}
        {clip.viralScore > 0 && (
          <span className={styles.score} title={labels.score}>
            <TrendingUp aria-hidden="true" />
            <span>{clip.viralScore}</span>
            <span className="sr-only">{labels.score}</span>
          </span>
        )}
        <span className={styles.duration}>{formatDuration(clip.duration)}</span>
      </Link>
      <div className={styles.details}>
        <div className={styles.titleRow}>
          <h2>
            <Link href={clipHref} title={clip.title}>
              {clip.title}
            </Link>
          </h2>
          {actions && (
            <ClipActionsMenu
              clip={clip}
              locale={locale}
              actions={actions}
              disabled={deleting}
              clipHref={clipHref}
              moveTargets={moveTargets}
              currentMoveTarget={currentMoveTarget}
              onMove={onMove}
              moveLabel={moveLabel}
              menuLabel={
                menuLabel ??
                `${locale === 'ro' ? 'Acțiuni pentru' : 'Actions for'} ${clip.title}`
              }
              cancelLabel={cancelLabel}
              onDelete={deleteClip}
            />
          )}
        </div>
        <p className={styles.metadata} title={projectName || undefined}>
          <time dateTime={clip.createdAt}>
            {formatClipDate(clip.createdAt, locale)}
          </time>
          <span aria-hidden="true">·</span>
          <span>{clip.aspectRatio}</span>
          <span aria-hidden="true">·</span>
          <span>{clip.resolution}</span>
        </p>
      </div>
    </Card>
  )
}
