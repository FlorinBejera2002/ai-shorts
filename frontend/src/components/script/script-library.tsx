'use client'

import type { ScriptRecord } from '@/lib/scripts-workspace'
import { Archive, CircleAlert, FileText, Plus, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ScriptLibraryCard } from './script-library-card'
import { ScriptStateCard } from './script-state-card'
import shared from './scripts-workspace.module.css'
import styles from './script-library.module.css'

type ScriptLibraryProps = {
  records: ScriptRecord[]
  query: string
  includeArchived: boolean
  busy: boolean
  error: string
  creating: boolean
  onQueryChange: (value: string) => void
  onArchivedChange: (value: boolean) => void
  onRetry: () => void
  onOpen: (record: ScriptRecord) => void
  onNew: () => void
}

export function ScriptLibrary({
  records,
  query,
  includeArchived,
  busy,
  error,
  creating,
  onQueryChange,
  onArchivedChange,
  onRetry,
  onOpen,
  onNew
}: ScriptLibraryProps) {
  const t = useTranslations('scriptGenerator')
  const filtered = Boolean(query.trim()) || includeArchived

  function content() {
    if (error) {
      return (
        <ScriptStateCard
          role="alert"
          tone="danger"
          title={t('workspace.loadErrorTitle')}
          icon={<CircleAlert />}
          className={styles.state}
        >
          <p className={styles.stateDetail}>{error}</p>
          <button type="button" className={shared.darkButton} onClick={onRetry}>
            {t('workspace.retry')}
          </button>
        </ScriptStateCard>
      )
    }
    if (records.length === 0 && busy) {
      return (
        <div className={styles.grid} aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={styles.placeholder} />
          ))}
        </div>
      )
    }
    if (records.length === 0) {
      return (
        <ScriptStateCard
          title={t(filtered ? 'workspace.noResults' : 'workspace.emptyTitle')}
          icon={<FileText />}
          className={styles.state}
        >
          {!filtered && (
            <button
              type="button"
              className={shared.primaryButton}
              onClick={onNew}
              disabled={creating}
            >
              {t('workspace.new')}
            </button>
          )}
        </ScriptStateCard>
      )
    }
    return (
      <div className={styles.grid}>
        {records.map((record) => (
          <ScriptLibraryCard key={record.id} record={record} onOpen={onOpen} />
        ))}
      </div>
    )
  }

  return (
    <section
      className={styles.library}
      aria-labelledby="script-library-heading"
      aria-busy={busy}
      data-script-library=""
    >
      <header className={styles.header}>
        <h1 id="script-library-heading" className={styles.title}>
          {t('workspace.title')}
        </h1>
        <button
          type="button"
          className={`${shared.primaryButton} ${styles.newButton}`}
          onClick={onNew}
          disabled={creating}
          data-script-new=""
        >
          <Plus aria-hidden="true" />
          <span className={styles.newLabel}>{t('workspace.new')}</span>
        </button>
      </header>

      <div className={styles.filters}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('workspace.searchPlaceholder')}
            aria-label={t('workspace.search')}
          />
        </label>
        <label className={styles.archivedSwitch}>
          {t('workspace.archivedFilter')}
          <input
            type="checkbox"
            role="switch"
            checked={includeArchived}
            onChange={(event) => onArchivedChange(event.target.checked)}
          />
        </label>
        <button
          type="button"
          className={styles.archivedToggle}
          aria-pressed={includeArchived}
          aria-label={t('workspace.showArchived')}
          onClick={() => onArchivedChange(!includeArchived)}
        >
          <Archive aria-hidden="true" />
        </button>
      </div>

      {content()}
    </section>
  )
}
