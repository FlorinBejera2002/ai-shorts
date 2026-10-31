'use client'

import { Link } from '@/i18n/navigation'
import { formatDuration } from '@/lib/utils'
import { Film, Star } from 'lucide-react'
import { useState } from 'react'
import { ClipActionsMenu, type ClipMoveTarget } from './clip-actions-menu'
import type { ClipCardData } from './clip-card'
import styles from './clip-library-card.module.css'
import {
  clipQuality,
  clipScoreTone,
  formatClipDay,
  formatClipScore
} from './clip-library-utils'
import { ClipDeleteDialog } from './clips-dialogs'
import { useClipsCopy } from './clips-copy'
import { useDeleteClip } from './use-delete-clip'

/** Portrait clip tile for the Clips library (reference design). */
export function ClipLibraryCard({
  clip,
  locale,
  moveTargets,
  currentMoveTarget,
  onMove,
  onDeleted
}: {
  clip: ClipCardData
  locale: string
  moveTargets: ClipMoveTarget[]
  currentMoveTarget: string
  onMove: (value: string) => Promise<void>
  onDeleted: () => void | Promise<void>
}) {
  const copy = useClipsCopy()
  const [confirming, setConfirming] = useState(false)
  const { deleting, deleteClip } = useDeleteClip({
    clipId: clip.id,
    successMessage: copy.deleteSuccess,
    errorMessage: copy.deleteError,
    onDeleted
  })
  const href = `/dashboard/clips/${encodeURIComponent(clip.id)}`
  const duration = formatDuration(clip.duration)
  const quality = clipQuality(clip.resolution)
  const score =
    clip.viralScore > 0 ? formatClipScore(clip.viralScore) : null

  return (
    <article
      className={styles.card}
      data-clip-card={clip.id}
      aria-busy={deleting || undefined}
    >
      <div className={styles.preview}>
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
        <Link
          href={href}
          className={styles.open}
          aria-label={copy.openClip(clip.title)}
        />
        <span className={styles.badges}>
          {score && (
            <span
              className={styles.score}
              data-tone={clipScoreTone(clip.viralScore)}
              title={copy.viralScore}
            >
              <Star aria-hidden="true" />
              {score}
              <span className="sr-only">{copy.viralScore}</span>
            </span>
          )}
          {clip.hasSubtitles && (
            <span className={styles.captions} title={copy.hasSubtitles}>
              <span aria-hidden="true">CC</span>
              <span className="sr-only">{copy.hasSubtitles}</span>
            </span>
          )}
        </span>
        <ClipActionsMenu
          clip={clip}
          locale={locale}
          appearance="reference"
          triggerClassName={styles.menu}
          summary={[duration, quality, score && `★ ${score}`]
            .filter(Boolean)
            .join(' · ')}
          actions={{
            edit: copy.open,
            publish: copy.publish,
            download: copy.download,
            delete: copy.remove,
            deleteConfirm: copy.deleteClipTitle,
            deleteSuccess: copy.deleteSuccess,
            deleteError: copy.deleteError
          }}
          disabled={deleting}
          clipHref={href}
          moveTargets={moveTargets}
          currentMoveTarget={currentMoveTarget}
          onMove={onMove}
          moveLabel={copy.moveToProject}
          menuLabel={copy.clipActions(clip.title)}
          cancelLabel={copy.cancel}
          onDelete={() => setConfirming(true)}
        />
        <span className={styles.duration}>{duration}</span>
      </div>
      <div className={styles.details}>
        <h3 className={styles.title} title={clip.title}>
          {clip.title}
        </h3>
        <p className={styles.meta}>
          <time dateTime={clip.createdAt}>
            {formatClipDay(clip.createdAt, locale)}
          </time>
          {' · '}
          {quality}
        </p>
      </div>
      <ClipDeleteDialog
        open={confirming}
        busy={deleting}
        thumbnailUrl={clip.thumbnailUrl}
        onOpenChange={setConfirming}
        onConfirm={async () => {
          if (await deleteClip()) setConfirming(false)
        }}
      />
    </article>
  )
}
