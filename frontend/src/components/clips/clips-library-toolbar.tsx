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
import { Link } from '@/i18n/navigation'
import type { ClipsLibraryQuery } from '@/lib/clips-library'
import {
  ArrowDownWideNarrow,
  Captions,
  type LucideIcon,
  Ratio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TrendingUp
} from 'lucide-react'
import { useState } from 'react'
import styles from './clips-library-toolbar.module.css'

type Option = { value: string; label: string }

export function ClipsLibraryToolbar({
  query,
  labels,
  scoreOptions,
  aspectOptions,
  subtitleOptions,
  sortOptions
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
}) {
  return (
    <form
      key={JSON.stringify(query)}
      action=""
      method="get"
      className={styles.toolbar}
      aria-label={labels.apply}
    >
      <div className={styles.row}>
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
        <div className={styles.filters}>
          <FilterSelect
            id="clips-score"
            name="score"
            label={labels.score}
            value={query.score}
            options={scoreOptions}
            icon={TrendingUp}
          />
          <FilterSelect
            id="clips-aspect"
            name="aspect"
            label={labels.aspect}
            value={query.aspect}
            options={aspectOptions}
            icon={Ratio}
          />
          <FilterSelect
            id="clips-subtitles"
            name="subtitles"
            label={labels.subtitles}
            value={query.subtitles}
            options={subtitleOptions}
            icon={Captions}
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
          <Button type="submit" className={styles.apply}>
            <SlidersHorizontal aria-hidden="true" />
            {labels.apply}
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
  defaultOption = 'all'
}: {
  id: string
  name: string
  label: string
  value: string
  options: Option[]
  icon: LucideIcon
  defaultOption?: string
}) {
  const [selected, setSelected] = useState(value)

  return (
    <div className={styles.filter} data-active={selected !== defaultOption}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Select name={name} value={selected} onValueChange={setSelected}>
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
