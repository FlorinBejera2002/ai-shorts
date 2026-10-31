'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'
import type { ClipsLibraryQuery } from '@/lib/clips-library'
import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { type ClipsFilterOption, useClipsCopy } from './clips-copy'
import styles from './clips-mobile-sheets.module.css'
import {
  type ClipsFilterValues,
  defaultClipsFilters
} from './use-clips-filters'

/** Phone filter sheet: choices stay pending until “Apply”. */
export function ClipsMobileFilters({
  query,
  activeCount,
  onApply
}: {
  query: ClipsLibraryQuery
  activeCount: number
  onApply: (values: ClipsFilterValues) => void
}) {
  const copy = useClipsCopy()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<ClipsFilterValues>(defaultClipsFilters)
  const groups: {
    name: keyof ClipsFilterValues
    label: string
    options: ClipsFilterOption[]
  }[] = [
    { name: 'score', label: copy.scoreLabel, options: copy.scoreOptions },
    { name: 'aspect', label: copy.formatTrigger, options: copy.formatOptions },
    { name: 'subtitles', label: copy.subtitlesLabel, options: copy.subtitleOptions },
    { name: 'sort', label: copy.sortLabel, options: copy.sortOptions }
  ]

  function changeOpen(value: boolean) {
    if (value)
      setPending({
        score: query.score,
        aspect: query.aspect,
        subtitles: query.subtitles,
        sort: query.sort
      })
    setOpen(value)
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild={true}>
        <button
          type="button"
          className={styles.filterButton}
          data-active={activeCount > 0}
          aria-label={activeCount ? copy.filtersActive(activeCount) : copy.filters}
        >
          <SlidersHorizontal aria-hidden="true" />
          {activeCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {activeCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        className={`${theme.surface} ${styles.sheet} ${styles.tall}`}
        overlayClassName={theme.overlay}
        data-reference-surface=""
        data-clips-filters=""
      >
        <span className={styles.handle} aria-hidden="true" />
        <header className={styles.header}>
          <SheetTitle className={styles.title}>{copy.filters}</SheetTitle>
          <button
            type="button"
            className={styles.link}
            onClick={() => setPending(defaultClipsFilters)}
          >
            {copy.clearFilters}
          </button>
        </header>
        <div className={styles.groups}>
          {groups.map((group) => (
            <div
              key={group.name}
              role="radiogroup"
              aria-label={group.label}
              className={styles.group}
            >
              <span className={styles.groupLabel}>{group.label}</span>
              <div className={styles.chips}>
                {group.options.map((option) => {
                  const checked = pending[group.name] === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className={styles.chip}
                      onClick={() =>
                        setPending((current) => ({
                          ...current,
                          [group.name]: option.value
                        }))
                      }
                    >
                      {option.chip}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              onApply(pending)
              setOpen(false)
            }}
          >
            {copy.apply}
          </button>
        </footer>
      </SheetContent>
    </Sheet>
  )
}
