import { Link } from '@/i18n/navigation'
import { type ClipsLibraryQuery, clipsLibraryHref } from '@/lib/clips-library'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function ClipsPagination({
  query,
  currentPage,
  totalPages,
  labels
}: {
  query: ClipsLibraryQuery
  currentPage: number
  totalPages: number
  labels: { previous: string; next: string; page: string }
}) {
  if (totalPages <= 1) return null

  const pageNumbers = Array.from(
    new Set(
      [1, currentPage - 1, currentPage, currentPage + 1, totalPages].filter(
        (page) => page >= 1 && page <= totalPages
      )
    )
  ).sort((a, b) => a - b)

  return (
    <nav
      className="mt-8 flex flex-wrap items-center justify-center gap-2"
      aria-label={labels.page}
    >
      <PaginationLink
        href={clipsLibraryHref(query, { page: Math.max(1, currentPage - 1) })}
        label={labels.previous}
        disabled={currentPage === 1}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">{labels.previous}</span>
      </PaginationLink>

      {pageNumbers.map((page, index) => {
        const previous = pageNumbers[index - 1]
        const gap = previous !== undefined && page - previous > 1
        return (
          <span key={page} className="contents">
            {gap && <span className="px-1 text-muted-foreground">…</span>}
            <Link
              href={clipsLibraryHref(query, { page })}
              aria-label={`${labels.page} ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
              className={`flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors ${
                page === currentPage
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:border-primary/40 hover:text-primary'
              }`}
            >
              {page}
            </Link>
          </span>
        )
      })}

      <PaginationLink
        href={clipsLibraryHref(query, {
          page: Math.min(totalPages, currentPage + 1)
        })}
        label={labels.next}
        disabled={currentPage === totalPages}
      >
        <span className="hidden sm:inline">{labels.next}</span>
        <ChevronRight className="h-4 w-4" />
      </PaginationLink>
    </nav>
  )
}

function PaginationLink({
  href,
  label,
  disabled,
  children
}: {
  href: string
  label: string
  disabled: boolean
  children: ReactNode
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="flex min-h-10 items-center gap-1 rounded-lg border border-border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground opacity-55"
      >
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex min-h-10 items-center gap-1 rounded-lg border border-border bg-card px-3 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
    >
      {children}
    </Link>
  )
}
