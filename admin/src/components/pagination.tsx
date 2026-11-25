import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './ui/button'

type PaginationProps = {
  page: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  /** Suffix for the button labels, e.g. "de abonamente". */
  subject?: string
}

/** Compact "1 / 3" pager, hidden when everything fits on one page. */
export function Pagination({ page, total, pageSize, onPage, subject }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages === 1 && page === 1) return null
  const suffix = subject ? ` ${subject}` : ''
  return (
    <div className="pagination">
      <Button aria-label={`Pagina anterioară${suffix}`} variant="secondary" size="icon" disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
      <span>{page} / {pages}</span>
      <Button aria-label={`Pagina următoare${suffix}`} variant="secondary" size="icon" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
    </div>
  )
}
