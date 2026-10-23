'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  isPublishingProvider,
  PUBLISHING_PROVIDER_CATALOG
} from '@/lib/publishing'
import type { ScriptRecord } from '@/lib/scripts-workspace'
import { Check, FileText, Plus, Search } from 'lucide-react'
import styles from './script-library.module.css'

type ScriptLibraryProps = {
  records: ScriptRecord[]
  query: string
  includeArchived: boolean
  busy: boolean
  labels: Record<string, string>
  locale?: string
  creating?: boolean
  onQueryChange: (value: string) => void
  onArchivedChange: (value: boolean) => void
  onOpen: (record: ScriptRecord) => void
  onNew: () => void
}

export function ScriptLibrary({
  records,
  query,
  includeArchived,
  busy,
  labels,
  locale,
  creating = false,
  onQueryChange,
  onArchivedChange,
  onOpen,
  onNew
}: ScriptLibraryProps) {
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })

  return (
    <section
      className={styles.library}
      aria-labelledby="script-library-heading"
      aria-busy={busy}
      data-script-library
    >
      <div className={styles.heading}>
        <h1 id="script-library-heading" className={styles.title}>
          {labels.title}
        </h1>
        <Button
          onClick={onNew}
          disabled={creating}
          className={styles.newButton}
        >
          <Plus className="size-5" aria-hidden="true" />
          {labels.new}
        </Button>
      </div>

      <div className={styles.filters}>
        <div className={styles.search}>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
            className={styles.searchInput}
          />
        </div>
        <label className={styles.archived}>
          <span className={styles.checkbox}>
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => onArchivedChange(event.target.checked)}
            />
            <Check aria-hidden="true" />
          </span>
          {labels.archived}
        </label>
      </div>

      {records.length === 0 && !busy ? (
        <div className={styles.empty}>
          <FileText
            className={styles.emptyIcon}
            strokeWidth={1.2}
            aria-hidden="true"
          />
          <h2 className={styles.emptyTitle}>{labels.emptyTitle}</h2>
          <Button
            onClick={onNew}
            disabled={creating}
            className={styles.newButton}
          >
            <Plus className="size-5" aria-hidden="true" />
            {labels.new}
          </Button>
        </div>
      ) : (
        <div className={styles.grid}>
          {records.map((record) => {
            const status = record.archived ? 'archived' : record.status
            const platform = PUBLISHING_PROVIDER_CATALOG.find(
              ({ id }) => id === record.platform
            )

            return (
              <Card key={record.id} as="article" className={styles.card}>
                <button
                  type="button"
                  onClick={() => onOpen(record)}
                  className={styles.cardButton}
                  data-script-card={record.id}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.status}>
                      {labels[`status.${status}`] ??
                        status.replaceAll('_', ' ')}
                    </span>
                    <span className={styles.version}>v{record.revision}</span>
                  </div>
                  <h2 className={styles.cardTitle}>{record.title}</h2>
                  <p className={styles.topic}>
                    {record.topic || labels.noBrief}
                  </p>
                  <div className={styles.cardFooter}>
                    <span className={styles.platform}>
                      {isPublishingProvider(record.platform) && (
                        <PlatformBrandIcon
                          provider={record.platform}
                          className={styles.platformIcon}
                        />
                      )}
                      {platform?.name ?? labels.platformRequired}
                    </span>
                    <time dateTime={record.updatedAt}>
                      {dateFormatter.format(new Date(record.updatedAt))}
                    </time>
                  </div>
                </button>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
