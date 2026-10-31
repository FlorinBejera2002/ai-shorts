'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { ClipsLibraryQuery } from '@/lib/clips-library'
import { Search } from 'lucide-react'
import { type FormEvent, useRef } from 'react'
import { type ClipsFilterOption, useClipsCopy } from './clips-copy'
import styles from './clips-library-toolbar.module.css'
import { ClipsMobileFilters } from './clips-mobile-filters'
import {
  type ClipsFilterValues,
  countActiveClipFilters,
  useClipsFilters
} from './use-clips-filters'

const scoreDots: Record<string, string> = {
  all: 'neutral',
  high: 'high',
  promising: 'promising',
  low: 'low'
}

/** Search, filters and sorting for the Clips library. */
export function ClipsLibraryToolbar({ query }: { query: ClipsLibraryQuery }) {
  const copy = useClipsCopy()
  const searchInput = useRef<HTMLInputElement>(null)
  const { replaceFilters, clearFilters } = useClipsFilters()
  const active = countActiveClipFilters(query)

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    replaceFilters({ search: searchInput.current?.value.trim() ?? '' })
  }

  function setFilter(name: keyof ClipsFilterValues, value: string) {
    replaceFilters({
      search: searchInput.current?.value.trim() ?? query.search,
      [name]: value
    })
  }

  function clear() {
    if (searchInput.current) searchInput.current.value = ''
    clearFilters()
  }

  return (
    <div className={styles.toolbar}>
      <form
        className={styles.search}
        role="search"
        aria-label={copy.searchLabel}
        onSubmit={submitSearch}
      >
        <Search aria-hidden="true" />
        <input
          key={query.search}
          ref={searchInput}
          type="search"
          name="search"
          aria-label={copy.searchLabel}
          placeholder={copy.search}
          defaultValue={query.search}
          maxLength={80}
        />
      </form>
      <div className={styles.filters}>
        <FilterPill
          name="score"
          label={copy.scoreLabel}
          trigger={copy.scoreTrigger}
          value={query.score}
          options={copy.scoreOptions}
          dots={true}
          onChange={setFilter}
        />
        <FilterPill
          name="aspect"
          label={copy.formatLabel}
          trigger={copy.formatTrigger}
          value={query.aspect}
          options={copy.formatOptions}
          onChange={setFilter}
        />
        <FilterPill
          name="subtitles"
          label={copy.subtitlesLabel}
          trigger={copy.subtitlesTrigger}
          value={query.subtitles}
          options={copy.subtitleOptions}
          onChange={setFilter}
        />
        <FilterPill
          name="sort"
          label={copy.sortLabel}
          value={query.sort}
          options={copy.sortOptions}
          onChange={setFilter}
        />
        {(active > 0 || query.sort !== 'newest' || query.search) && (
          <button type="button" className={styles.clear} onClick={clear}>
            {copy.clearFilters}
          </button>
        )}
      </div>
      <ClipsMobileFilters
        query={query}
        activeCount={active}
        onApply={(values) =>
          replaceFilters({
            search: searchInput.current?.value.trim() ?? query.search,
            ...values
          })
        }
      />
    </div>
  )
}

function FilterPill({
  name,
  label,
  trigger,
  value,
  options,
  dots = false,
  onChange
}: {
  name: keyof ClipsFilterValues
  label: string
  /** Short name shown before the chosen value; sort shows only its value. */
  trigger?: string
  value: string
  options: ClipsFilterOption[]
  dots?: boolean
  onChange: (name: keyof ClipsFilterValues, value: string) => void
}) {
  const selected = options.find((option) => option.value === value)
  const isDefault = trigger ? value === 'all' : false
  const text = trigger
    ? isDefault
      ? trigger
      : `${trigger}: ${selected?.short ?? value}`
    : (selected?.label ?? value)
  return (
    <Select value={value} onValueChange={(next) => onChange(name, next)}>
      <SelectTrigger
        aria-label={label}
        className={styles.pill}
        data-active={Boolean(trigger) && !isDefault}
      >
        <SelectValue>{text}</SelectValue>
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        sideOffset={8}
        className={`${theme.surface} ${styles.listbox}`}
        data-reference-surface=""
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={styles.option}
          >
            {dots && (
              <span
                className={styles.dot}
                data-tone={scoreDots[option.value]}
                aria-hidden="true"
              />
            )}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
