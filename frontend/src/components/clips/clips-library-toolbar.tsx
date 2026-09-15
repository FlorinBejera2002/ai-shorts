'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Link, useRouter } from '@/i18n/navigation'
import type { ClipsLibraryQuery } from '@/lib/clips-library'
import {
  ArrowDownWideNarrow,
  Captions,
  FolderSearch,
  type LucideIcon,
  Ratio,
  RotateCcw,
  Search,
  TrendingUp
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import styles from './clips-library-toolbar.module.css'

type Option = { value: string; label: string }

export function ClipsLibraryToolbar({
  query,
  labels,
  scoreOptions,
  aspectOptions,
  subtitleOptions,
  sortOptions,
  organizationFilter,
  showSearch = true
}: {
  query: ClipsLibraryQuery
  labels: {
    search: string
    searchPlaceholder: string
    score: string
    aspect: string
    subtitles: string
    sort: string
    apply: string
    clear: string
  }
  scoreOptions: Option[]
  aspectOptions: Option[]
  subtitleOptions: Option[]
  sortOptions: Option[]
  organizationFilter?: {
    label: string
    value: string
    options: Option[]
    onChange: (value: string) => void
  }
  showSearch?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function applySelectedFilter(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    const defaultValue = name === 'sort' ? 'newest' : 'all'
    if (value === defaultValue) params.delete(name)
    else params.set(name, value)
    params.delete('page')
    const search = params.toString()
    router.replace(`/dashboard/clips${search ? `?${search}` : ''}`, {
      scroll: false
    })
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const params = new URLSearchParams()
    for (const [key, value] of values.entries()) {
      if (typeof value === 'string' && value) params.set(key, value)
    }
    const search = params.toString()
    router.replace(`/dashboard/clips${search ? `?${search}` : ''}`, {
      scroll: false
    })
  }

  return (
    <form
      key={JSON.stringify(query)}
      onSubmit={applyFilters}
      className={styles.toolbar}
      aria-label={labels.apply}
    >
      <div className={styles.row}>
        {showSearch && (
          <div className={styles.search}>
            <Label htmlFor="clips-search" className="sr-only">
              {labels.search}
            </Label>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <Input
              id="clips-search"
              name="search"
              type="search"
              defaultValue={query.search}
              maxLength={80}
              placeholder={labels.searchPlaceholder}
              className={styles.searchInput}
            />
          </div>
        )}
        <div className={styles.filters}>
          {organizationFilter && (
            <FilterSelect
              id="clips-organization"
              name="organization"
              label={organizationFilter.label}
              value={organizationFilter.value}
              options={organizationFilter.options}
              icon={FolderSearch}
              onChange={(_, value) => organizationFilter.onChange(value)}
            />
          )}
          <FilterSelect
            id="clips-score"
            name="score"
            label={labels.score}
            value={query.score}
            options={scoreOptions}
            icon={TrendingUp}
            onChange={applySelectedFilter}
          />
          <FilterSelect
            id="clips-aspect"
            name="aspect"
            label={labels.aspect}
            value={query.aspect}
            options={aspectOptions}
            icon={Ratio}
            onChange={applySelectedFilter}
          />
          <FilterSelect
            id="clips-subtitles"
            name="subtitles"
            label={labels.subtitles}
            value={query.subtitles}
            options={subtitleOptions}
            icon={Captions}
            onChange={applySelectedFilter}
          />
        </div>
        <div className={styles.sort}>
          <FilterSelect
            id="clips-sort"
            name="sort"
            label={labels.sort}
            value={query.sort}
            options={sortOptions}
            icon={ArrowDownWideNarrow}
            defaultOption="newest"
            onChange={applySelectedFilter}
          />
        </div>
        <div className={styles.actions}>
          <Button asChild={true} variant="ghost" className={styles.clear}>
            <Link
              href="/dashboard/clips"
              aria-label={labels.clear}
              title={labels.clear}
            >
              <RotateCcw aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </form>
  )
}

function FilterSelect({
  id,
  name,
  label,
  value,
  options,
  icon: Icon,
  defaultOption = 'all',
  onChange
}: {
  id: string
  name: string
  label: string
  value: string
  options: Option[]
  icon: LucideIcon
  defaultOption?: string
  onChange: (name: string, value: string) => void
}) {
  const [selected, setSelected] = useState(value)

  return (
    <div className={styles.filter} data-active={selected !== defaultOption}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Select
        name={name}
        value={selected}
        onValueChange={(nextValue) => {
          setSelected(nextValue)
          onChange(name, nextValue)
        }}
      >
        <SelectTrigger id={id} className={styles.select}>
          <Icon className={styles.filterIcon} aria-hidden="true" />
          <SelectValue>
            {selected === defaultOption && name !== 'sort'
              ? label
              : options.find((option) => option.value === selected)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          sideOffset={6}
          className={styles.menu}
        >
          <SelectGroup>
            <SelectLabel>{label}</SelectLabel>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
