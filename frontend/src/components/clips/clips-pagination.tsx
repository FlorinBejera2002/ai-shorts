import { Link } from '@/i18n/navigation'
import { type ClipsLibraryQuery, clipsLibraryHref } from '@/lib/clips-library'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './clips-pagination.module.css'

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
    <nav className={styles.pagination} aria-label={labels.page}>
      <PaginationLink
        href={clipsLibraryHref(query, { page: Math.max(1, currentPage - 1) })}
        label={labels.previous}
        disabled={currentPage === 1}
      >
        <ChevronLeft className="h-4 w-4" />
      </PaginationLink>

      {pageNumbers.map((page, index) => {
        const previous = pageNumbers[index - 1]
        const gap = previous !== undefined && page - previous > 1
        return (
          <span key={page} className="contents">
            {gap && <span className={styles.ellipsis}>…</span>}
            <Link
              href={clipsLibraryHref(query, { page })}
              aria-label={`${labels.page} ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
              className={styles.page}
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
      <span aria-disabled="true" aria-label={label} className={styles.arrow}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} aria-label={label} className={styles.arrow}>
      {children}
    </Link>
  )
}
