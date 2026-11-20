'use client'

import type { LibraryClip } from '@/lib/clips-library'
import { FolderInput } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import theme from '@/components/calendar/publishing-theme.module.css'
import styles from './clips.module.css'

/** The thumbnail that follows the pointer while a clip is dragged onto a project. */
export function ClipDragGhost({
  clip,
  targetName,
  ghostRef
}: {
  clip: LibraryClip
  targetName: string | null
  ghostRef: RefObject<HTMLDivElement | null>
}) {
  const t = useTranslations('clipsLibrary')
  return createPortal(
    <div ref={ghostRef} className={`${theme.surface} ${styles.tokens} ${styles.dragGhost}`} aria-hidden="true" data-clips-drag-ghost="">
      <span>{clip.thumbnailUrl && <img src={clip.thumbnailUrl} alt="" />}</span>
      {targetName && (
        <span className={styles.ghostLabel}>
          <FolderInput aria-hidden="true" />
          {t('moveTo', { name: targetName })}
        </span>
      )}
    </div>,
    document.body
  )
}
