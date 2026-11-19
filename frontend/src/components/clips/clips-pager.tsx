'use client'

import { Link } from '@/i18n/navigation'
import { pageWindow, type ClipsQuery } from '@/lib/clips-library'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import styles from './clips.module.css'

/** Desktop pagination pill: "1–10 din 24", Înapoi, page numbers, Înainte. */
export function ClipsPager({
  page,
  pages,
  from,
  to,
  total,
  href
}: {
  page: number
  pages: number
  from: number
  to: number
  total: number
  href: (changes: Partial<ClipsQuery>) => string
}) {
  const t = useTranslations('clipsLibrary')
  if (pages <= 1)
    return (
      <div className={`${styles.pagerTotal} ${styles.muted}`} data-clips-pager="">
        {t('clipCount', { count: total })}
      </div>
    )
  return (
    <nav className={styles.pager} aria-label={t('pages')} data-clips-pager="">
      <span className={styles.muted}>{t.rich('range', { from, to, total, b: (chunks) => <b>{chunks}</b> })}</span>
      <span className={styles.pages}>
        <PageLink href={href({ page: page - 1 })} disabled={page === 1} label={t('previous')} wide>
          <ChevronLeft aria-hidden="true" />
          {t('previous')}
        </PageLink>
        {pageWindow(page, pages).map((entry, index) =>
          entry === 'gap' ? (
            <span key={`gap-${index}`} className={styles.muted} aria-hidden="true">
              …
            </span>
          ) : (
            <PageLink key={entry} href={href({ page: entry })} current={entry === page} label={t('page', { page: entry })}>
              {entry}
            </PageLink>
          )
        )}
        <PageLink href={href({ page: page + 1 })} disabled={page === pages} label={t('next')} wide>
          {t('next')}
          <ChevronRight aria-hidden="true" />
        </PageLink>
      </span>
    </nav>
  )
}

function PageLink({
  href,
  label,
  current,
  disabled,
  wide,
  children
}: {
  href: string
  label: string
  current?: boolean
  disabled?: boolean
  wide?: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      replace
      preventScrollReset
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className={`${styles.pageButton} ${styles.focus}`}
      data-wide={wide ? '' : undefined}
    >
      {children}
    </Link>
  )
}

/** Phone list: "Arată mai multe" and how many are shown. */
export function ClipsLoadMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const t = useTranslations('clipsLibrary')
  return (
    <div className={styles.loadMore} data-clips-load-more="">
      {shown < total && (
        <button type="button" className={`${styles.button} ${styles.secondary} ${styles.focus}`} onClick={onMore}>
          <ChevronDown aria-hidden="true" />
          {t('showMore')}
        </button>
      )}
      <span className={styles.muted}>{t('shownOf', { shown, total })}</span>
    </div>
  )
}
