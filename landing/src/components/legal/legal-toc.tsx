'use client'

import { useEffect, useId, useState } from 'react'
import { Icon } from '@/components/ui/icons'
import styles from './legal.module.css'

type TocEntry = { id: string; title: string }

type LegalTocProps = { title: string; toggleLabel: string; entries: TocEntry[] }

/** Highlights the section being read; on mobile it collapses behind a toggle. */
export function LegalToc({ title, toggleLabel, entries }: LegalTocProps) {
  const [activeId, setActiveId] = useState(entries[0]?.id)
  const [open, setOpen] = useState(false)
  const listId = useId()

  useEffect(() => {
    const sections = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((element): element is HTMLElement => element !== null)
    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed.filter((entry) => entry.isIntersecting)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { rootMargin: '0px 0px -70% 0px' }
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [entries])

  return (
    <nav aria-label={title} className={styles.toc}>
      <button type="button" className={`card ${styles.tocToggle}`} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)}>
        {toggleLabel}
        <Icon name="chevronDown" className={open ? styles.tocChevronOpen : undefined} />
      </button>
      <div id={listId} className={`card ${styles.tocCard} ${open ? styles.tocOpen : ''}`}>
        <b className={styles.tocTitle}>{title}</b>
        {entries.map((entry) => (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            className={styles.tocLink}
            aria-current={entry.id === activeId ? 'location' : undefined}
            onClick={() => setOpen(false)}
          >
            {entry.title}
          </a>
        ))}
      </div>
    </nav>
  )
}
