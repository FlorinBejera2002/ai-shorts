'use client'

import type { ScriptVersion } from '@/lib/scripts-workspace'
import { useLocale, useTranslations } from 'next-intl'
import { formatVersionTime } from './script-format'
import styles from './script-editor.module.css'

/** Version rows shared by the desktop panel and the phone sheet. */
export function ScriptVersionList({
  versions,
  revision,
  onRestore
}: {
  versions: ScriptVersion[]
  revision: number
  onRestore: (versionId: string) => void
}) {
  const t = useTranslations('scriptGenerator')
  const locale = useLocale()

  return (
    <ol className={styles.versionList} data-script-versions="">
      {versions.map((version) => {
        const current = version.versionNumber === revision
        return (
          <li
            key={version.id}
            className={styles.version}
            data-current={current}
          >
            <span className={styles.versionNumber}>v{version.versionNumber}</span>
            <span className={styles.versionText}>
              <span>{version.summary || version.changeType}</span>
              <time dateTime={version.createdAt}>
                {formatVersionTime(version.createdAt, locale)}
              </time>
            </span>
            {current ? (
              <span className={styles.currentBadge}>
                {t('workspace.current')}
              </span>
            ) : (
              <button
                type="button"
                className={styles.restoreButton}
                onClick={() => onRestore(version.id)}
              >
                {t('workspace.restore')}
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
