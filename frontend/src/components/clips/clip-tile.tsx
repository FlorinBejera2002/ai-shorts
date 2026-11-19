'use client'

import { Link } from '@/i18n/navigation'
import { formatClipAge, formatClipLength } from '@/lib/clip-time'
import type { LibraryClip } from '@/lib/clips-library'
import { EllipsisVertical, Film, Star } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState, type PointerEvent } from 'react'
import { ClipActionsMenu, type ClipCommands } from './clip-actions'
import styles from './clips.module.css'

type ClipTileProps = {
  clip: LibraryClip
  projectName: string | null
  commands: ClipCommands
  mobile: boolean
  dragging: boolean
  onPointerDown: (clip: LibraryClip, event: PointerEvent) => void
  onOpenSheet: (clip: LibraryClip) => void
}

/** Portrait clip card: preview with CC/duration badges, title, project · age and the ⋮ menu. */
export function ClipTile({ clip, projectName, commands, mobile, dragging, onPointerDown, onOpenSheet }: ClipTileProps) {
  const t = useTranslations('clipsLibrary')
  const locale = useLocale()
  const [broken, setBroken] = useState(false)
  // The star pops once when a clip becomes a favourite.
  const [popped, setPopped] = useState(false)
  return (
    <article
      className={`${styles.card} ${styles.clip}`}
      aria-label={clip.title}
      data-clip-card={clip.id}
      data-dragging={dragging ? '' : undefined}
      onPointerDown={(event) => onPointerDown(clip, event)}
      onContextMenu={(event) => mobile && event.preventDefault()}
    >
      <div className={styles.preview}>
        <button
          type="button"
          className={`${styles.star} ${styles.focus}`}
          aria-label={t(clip.favorite ? 'unstar' : 'star', { title: clip.title })}
          aria-pressed={clip.favorite}
          onClick={() => {
            setPopped(!clip.favorite)
            commands.onFavorite(clip)
          }}
          onAnimationEnd={() => setPopped(false)}
          data-pop={popped ? '' : undefined}
          data-clip-favorite=""
        >
          <Star aria-hidden="true" fill={clip.favorite ? 'currentColor' : 'none'} strokeWidth={2} />
        </button>
        <Link
          href={`/dashboard/clips/${encodeURIComponent(clip.id)}`}
          className={`${styles.thumb} ${styles.focus}`}
          aria-label={t('open', { title: clip.title })}
          draggable={false}
        >
          {clip.thumbnailUrl && !broken ? (
            <img src={clip.thumbnailUrl} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />
          ) : (
            <span className={styles.thumbFallback}>
              <Film aria-hidden="true" strokeWidth={1.25} />
              {t('noPreview')}
            </span>
          )}
          {clip.hasSubtitles && (
            <span className={styles.cc} aria-label={t('subtitlesIncluded')}>
              CC
            </span>
          )}
          <span className={styles.duration}>{formatClipLength(clip.duration)}</span>
        </Link>
      </div>
      <div className={styles.clipBody}>
        <span className={styles.clipCopy}>
          <b>{clip.title}</b>
          <span className={styles.muted}>
            {projectName ?? t('unassigned')} · {formatClipAge(clip.createdAt, locale)}
          </span>
        </span>
        {mobile ? (
          <button
            type="button"
            className={`${styles.iconButton} ${styles.focus}`}
            aria-label={t('actions', { title: clip.title })}
            aria-haspopup="menu"
            onClick={() => onOpenSheet(clip)}
          >
            <EllipsisVertical aria-hidden="true" />
          </button>
        ) : (
          <ClipActionsMenu clip={clip} commands={commands} />
        )}
      </div>
    </article>
  )
}
