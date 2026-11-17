'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import styles from './script-document.module.css'

function normalize(value: string) {
  return value.trim().replace(/^#+/, '').replace(/\s+/g, '')
}

/** Removable hashtag chips with an inline "+ hashtag" entry field. */
export function ScriptHashtags({
  value,
  onChange
}: {
  value: string[]
  onChange: (value: string[]) => void
}) {
  const t = useTranslations('scriptGenerator')
  const labelId = useId()
  const [draft, setDraft] = useState('')

  function add(parts: string[]) {
    const next = [...value]
    for (const part of parts.map(normalize)) {
      if (part && !next.includes(part)) next.push(part)
    }
    if (next.length !== value.length) onChange(next)
  }

  function change(text: string) {
    // Typing or pasting a comma-separated list commits every finished tag.
    const parts = text.split(/[,\n]/)
    const pending = parts.pop() ?? ''
    if (parts.length) add(parts)
    setDraft(pending)
  }

  function commit() {
    add([draft])
    setDraft('')
  }

  return (
    <div className={styles.hashtags} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.groupLabel}>
        {t('hashtagsLabel')}
      </span>
      <div className={styles.tagList}>
        {value.map((tag) => (
          <span key={tag} className={styles.tag}>
            #{tag}
            <button
              type="button"
              aria-label={t('workspace.removeHashtag', { tag })}
              onClick={() => onChange(value.filter((item) => item !== tag))}
            >
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id="script-hashtags"
          className={styles.tagInput}
          value={draft}
          aria-label={t('workspace.addHashtag')}
          placeholder="+ hashtag"
          onChange={(event) => change(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
        />
      </div>
    </div>
  )
}
