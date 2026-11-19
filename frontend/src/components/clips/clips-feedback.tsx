'use client'

import type { LibraryClip } from '@/lib/clips-library'
import { Check, FolderInput } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import theme from '@/components/calendar/publishing-theme.module.css'
import styles from './clips.module.css'

export type ClipsNotice = { id: number; message: string }

const NOTICE_MS = 4000

/** Confirmation toast ("Clipul a fost mutat în Rețete."), dismissed after a few seconds. */
export function ClipsToast({ notice, onDone }: { notice: ClipsNotice | null; onDone: () => void }) {
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(onDone, NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice, onDone])
  if (!notice) return null
  return (
    <div key={notice.id} role="status" className={`${styles.card} ${styles.toast}`} data-clips-toast="">
      <span aria-hidden="true">
        <Check strokeWidth={2.5} />
      </span>
      <b>{notice.message}</b>
    </div>
  )
}

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
