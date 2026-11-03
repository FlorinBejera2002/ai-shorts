'use client'

import type { ScriptRecord } from '@/lib/scripts-workspace'
import { ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { ScriptPlatformBadge, ScriptStatusPill } from './script-badges'
import { formatUpdated } from './script-format'
import styles from './script-library.module.css'

export function ScriptLibraryCard({
  record,
  onOpen
}: {
  record: ScriptRecord
  onOpen: (record: ScriptRecord) => void
}) {
  const t = useTranslations('scriptGenerator')
  const locale = useLocale()
  const status = record.archived ? 'archived' : record.status
  const sceneCount = record.snapshot?.scenes?.length ?? 0
  const statusLabel = t.has(`workspace.status.${status}`)
    ? t(`workspace.status.${status}`)
    : status.replaceAll('_', ' ')

  return (
    <article className={styles.card}>
      <ScriptPlatformBadge
        platform={record.platform}
        className={styles.cardPlatform}
        fallbackLabel={t('platformRequired')}
      />
      <ScriptStatusPill
        status={status}
        label={statusLabel}
        className={styles.cardStatus}
      />
      <h2 className={styles.cardTitle}>
        <button
          type="button"
          className={styles.cardButton}
          onClick={() => onOpen(record)}
          data-script-card={record.id}
        >
          {record.title}
        </button>
      </h2>
      <p className={styles.cardTopic} data-empty={!record.topic}>
        {record.topic || t('workspace.noBrief')}
      </p>
      <p className={styles.cardMeta}>
        <span>{t('workspace.seconds', { count: record.targetDurationSeconds })}</span>
        <span aria-hidden="true" className={styles.cardScenes}>
          ·
        </span>
        <span className={styles.cardScenes}>
          {t('workspace.sceneCount', { count: sceneCount })}
        </span>
        <span aria-hidden="true" className={styles.cardMobileDot}>
          ·
        </span>
        <time dateTime={record.updatedAt} className={styles.cardWhen}>
          {formatUpdated(record.updatedAt, locale)}
        </time>
      </p>
      <ChevronRight className={styles.cardChevron} aria-hidden="true" />
    </article>
  )
}
