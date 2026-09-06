import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
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
    <Card className="mt-2 gap-0 py-0 shadow-none">
      <CardContent className="p-5">
        <form
          action=""
          method="get"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label={labels.apply}
        >
          <div className="min-w-0 sm:col-span-2">
            <Label htmlFor="clips-search" className="field-label">
              {labels.search}
            </Label>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
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
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button
              type="submit"
              variant="default"
              className="flex-1 lg:flex-none"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {labels.apply}
            </Button>
            <Button asChild={true} variant="outline">
              <Link
                href="/dashboard/clips"
                className="px-3"
                aria-label={labels.clear}
                title={labels.clear}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
      <Label htmlFor={id} className="field-label">
        {label}
      </Label>
      <NativeSelect
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
      </NativeSelect>
    </div>
  )
}
