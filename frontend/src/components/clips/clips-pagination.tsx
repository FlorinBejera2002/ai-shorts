import { Link } from '@/i18n/navigation'
import { type ClipsLibraryQuery, clipsLibraryHref } from '@/lib/clips-library'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './clips-pagination.module.css'

/** “1–24 of 48” summary with previous/next page links. */
export function ClipsPagination({
  query,
  currentPage,
  totalPages,
  summary,
  labels
}: {
  query: ClipsLibraryQuery
  currentPage: number
  totalPages: number
  summary: string
  labels: { previous: string; next: string; page: string }
}) {
  return (
    <nav className={styles.pagination} aria-label={labels.page}>
      <p className={styles.summary} aria-live="polite">
        {summary}
      </p>
      <PaginationLink
        href={clipsLibraryHref(query, { page: Math.max(1, currentPage - 1) })}
        label={labels.previous}
        disabled={currentPage <= 1}
      >
        <ChevronLeft aria-hidden="true" />
      </PaginationLink>
      <PaginationLink
        href={clipsLibraryHref(query, {
          page: Math.min(totalPages, currentPage + 1)
        })}
        label={labels.next}
        disabled={currentPage >= totalPages}
      >
        <ChevronRight aria-hidden="true" />
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
  if (disabled)
    return (
      <button
        type="button"
        disabled={true}
        aria-disabled="true"
        aria-label={label}
        className={styles.arrow}
      >
        {children}
      </button>
    )
  return (
    <Link href={href} aria-label={label} className={styles.arrow}>
      {children}
    </Link>
  )
}
