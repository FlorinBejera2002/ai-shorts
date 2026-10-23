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
import { useRouter } from '@/i18n/navigation'
import type { ClipsLibraryQuery } from '@/lib/clips-library'
import { cn } from '@/lib/utils'
import {
  ArrowDownWideNarrow,
  Captions,
  ChevronDown,
  Filter,
  FolderOpen,
  type LucideIcon,
  Ratio,
  RotateCcw,
  Search,
  TrendingUp
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Popover } from 'radix-ui'
import { type FormEvent, useId, useRef } from 'react'
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
    filters?: string
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
    mobileOnly?: boolean
  }
  showSearch?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchInput = useRef<HTMLInputElement>(null)
  const id = useId()
  const filtersLabel = labels.filters ?? labels.apply
  const activeFilters = [query.score, query.aspect, query.subtitles].filter(
    (value) => value !== 'all'
  ).length

  function replaceFilters(changes: Record<string, string> = {}) {
    const params = new URLSearchParams(searchParams.toString())
    const values = {
      search: searchInput.current?.value.trim() ?? query.search,
      ...changes
    }
    for (const [name, value] of Object.entries(values)) {
      const defaultValue = name === 'sort' ? 'newest' : 'all'
      if (!value || (name !== 'search' && value === defaultValue))
        params.delete(name)
      else params.set(name, value)
    }
    params.delete('page')
    const search = params.toString()
    router.replace(`/dashboard/clips${search ? `?${search}` : ''}`, {
      scroll: false
    })
  }

  function applySelectedFilter(name: string, value: string) {
    replaceFilters({ [name]: value })
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    replaceFilters()
  }

  function clearFilters() {
    if (searchInput.current) searchInput.current.value = ''
    replaceFilters({
      search: '',
      score: 'all',
      aspect: 'all',
      subtitles: 'all',
      sort: 'newest'
    })
  }

  return (
    <form
      onSubmit={applyFilters}
      className={styles.toolbar}
      aria-label={labels.apply}
    >
      <div className={styles.row}>
        <div className={cn(styles.search, !showSearch && styles.mobileSearch)}>
          <Label htmlFor={`${id}-search`} className="sr-only">
            {labels.search}
          </Label>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <Input
            key={query.search}
            ref={searchInput}
            id={`${id}-search`}
            name="search"
            type="search"
            defaultValue={query.search}
            maxLength={80}
            placeholder={labels.searchPlaceholder}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.controls}>
          {organizationFilter && (
            <div
              className={cn(
                styles.organization,
                organizationFilter.mobileOnly && styles.mobileOnly
              )}
            >
              <FilterSelect
                id={`${id}-organization`}
                name="organization"
                label={organizationFilter.label}
                value={organizationFilter.value}
                options={organizationFilter.options}
                icon={FolderOpen}
                onChange={(_, value) => {
                  replaceFilters()
                  organizationFilter.onChange(value)
                }}
              />
            </div>
          )}
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button
                type="button"
                variant="outline"
                className={styles.filtersTrigger}
                aria-label={filtersLabel}
                data-active={activeFilters > 0}
              >
                <Filter aria-hidden="true" />
                <span>{filtersLabel}</span>
                <ChevronDown className={styles.chevron} aria-hidden="true" />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className={styles.filtersPanel}
                aria-label={filtersLabel}
                align="end"
                sideOffset={8}
                collisionPadding={16}
              >
                <p className={styles.panelTitle}>{filtersLabel}</p>
                <FilterSelect
                  id={`${id}-score`}
                  name="score"
                  label={labels.score}
                  value={query.score}
                  options={scoreOptions}
                  icon={TrendingUp}
                  showLabel
                  onChange={applySelectedFilter}
                />
                <FilterSelect
                  id={`${id}-aspect`}
                  name="aspect"
                  label={labels.aspect}
                  value={query.aspect}
                  options={aspectOptions}
                  icon={Ratio}
                  showLabel
                  onChange={applySelectedFilter}
                />
                <FilterSelect
                  id={`${id}-subtitles`}
                  name="subtitles"
                  label={labels.subtitles}
                  value={query.subtitles}
                  options={subtitleOptions}
                  icon={Captions}
                  showLabel
                  onChange={applySelectedFilter}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.clear}
                  onClick={clearFilters}
                >
                  <RotateCcw aria-hidden="true" />
                  {labels.clear}
                </Button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <div className={styles.sort}>
            <FilterSelect
              id={`${id}-sort`}
              name="sort"
              label={labels.sort}
              value={query.sort}
              options={sortOptions}
              icon={ArrowDownWideNarrow}
              defaultOption="newest"
              onChange={applySelectedFilter}
            />
          </div>
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
  showLabel = false,
  onChange
}: {
  id: string
  name: string
  label: string
  value: string
  options: Option[]
  icon: LucideIcon
  defaultOption?: string
  showLabel?: boolean
  onChange: (name: string, value: string) => void
}) {
  return (
    <div className={styles.filter} data-active={value !== defaultOption}>
      <Label htmlFor={id} className={showLabel ? styles.fieldLabel : 'sr-only'}>
        {label}
      </Label>
      <Select
        name={name}
        value={value}
        onValueChange={(nextValue) => onChange(name, nextValue)}
      >
        <SelectTrigger id={id} className={styles.select}>
          <Icon className={styles.filterIcon} aria-hidden="true" />
          <SelectValue />
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
