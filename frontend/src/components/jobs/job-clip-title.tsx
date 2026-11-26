'use client'

import { useState, type KeyboardEvent } from 'react'
import { useCreateText } from '@/components/create/create-text'
import { toast } from '@/lib/toast'
import { useRenameJobClip } from './use-job-clips'
import styles from './job-clips-grid.module.css'

const MAX_TITLE_LENGTH = 120

interface JobClipTitleProps {
  jobId: string
  clipId: string
  title: string
}

/**
 * The clip's automatic title, editable in place. Blur or Enter saves, Escape restores,
 * and an empty field falls back to the saved title.
 */
export function JobClipTitle({ jobId, clipId, title }: JobClipTitleProps) {
  const text = useCreateText()
  const rename = useRenameJobClip(jobId)
  const [draft, setDraft] = useState(title)
  const [savedTitle, setSavedTitle] = useState(title)

  // Follow a title that changed elsewhere (refetch or rollback) while the field is idle.
  if (title !== savedTitle) {
    setSavedTitle(title)
    setDraft(title)
  }

  function commit() {
    const next = draft.trim()
    if (!next || next === title) {
      setDraft(title)
      return
    }
    setDraft(next)
    rename.mutate(
      { clipId, title: next, previous: title },
      { onError: () => toast.error(text('The title was not saved.', 'Titlul nu a fost salvat.')) }
    )
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      setDraft(title)
      // Blur after the reset renders so commit() sees the saved title.
      const input = event.currentTarget
      requestAnimationFrame(() => input.blur())
    }
  }

  return (
    <input
      className={styles.title}
      value={draft}
      maxLength={MAX_TITLE_LENGTH}
      aria-label={text('Clip title', 'Titlul clipului')}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      enterKeyHint="done"
      spellCheck={false}
    />
  )
}
