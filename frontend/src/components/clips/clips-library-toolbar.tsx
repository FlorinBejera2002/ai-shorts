import { Link } from '@/i18n/navigation'
import type { ClipsLibraryQuery } from '@/lib/clips-library'
import { Search, SlidersHorizontal, X } from 'lucide-react'

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
      action=""
      method="get"
      className="panel mt-6 grid gap-3 p-4 lg:grid-cols-[minmax(14rem,1.5fr)_repeat(4,minmax(8rem,.7fr))_auto] lg:items-end"
      aria-label={labels.apply}
    >
      <div className="min-w-0">
        <label htmlFor="clips-search" className="field-label">
          {labels.search}
        </label>
        <div className="relative mt-1.5">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="clips-search"
            name="search"
            type="search"
            defaultValue={query.search}
            maxLength={80}
            placeholder={labels.searchPlaceholder}
            className="field-input pl-9"
          />
        </div>
      </div>
      <FilterSelect
        id="clips-score"
        name="score"
        label={labels.score}
        value={query.score}
        options={scoreOptions}
      />
      <FilterSelect
        id="clips-aspect"
        name="aspect"
        label={labels.aspect}
        value={query.aspect}
        options={aspectOptions}
      />
      <FilterSelect
        id="clips-subtitles"
        name="subtitles"
        label={labels.subtitles}
        value={query.subtitles}
        options={subtitleOptions}
      />
      <FilterSelect
        id="clips-sort"
        name="sort"
        label={labels.sort}
        value={query.sort}
        options={sortOptions}
      />
      <div className="flex gap-2 lg:justify-end">
        <button type="submit" className="button-primary flex-1 lg:flex-none">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {labels.apply}
        </button>
        <Link
          href="/dashboard/clips"
          className="button-secondary px-3"
          aria-label={labels.clear}
          title={labels.clear}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </form>
  )
}

function FilterSelect({
  id,
  name,
  label,
  value,
  options
}: {
  id: string
  name: string
  label: string
  value: string
  options: Option[]
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className="field-input mt-1.5"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
