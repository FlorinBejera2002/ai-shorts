'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RotateCcw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import styles from './scripts-workspace.module.css'

export function ScriptVersionHistory({
  workspace: w
}: {
  workspace: ScriptsWorkspace
}) {
  const t = useTranslations('scriptGenerator')
  const locale = useLocale()
  return (
    <Card
      className={styles.versions}
      id="script-version-history"
      data-script-versions=""
    >
      <h2>{t('workspace.versionHistory')}</h2>
      <table>
        <thead>
          <tr>
            {['version', 'date', 'time', 'summary', 'action'].map((key) => (
              <th key={key} scope="col">
                {t(`workspace.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {w.versions.map((version) => {
            const current = version.versionNumber === w.revision
            const date = new Date(version.createdAt)
            return (
              <tr key={version.id} data-current={current}>
                <td className={styles.versionBadge}>
                  <span>v{version.versionNumber}</span>
                  {current && <small>{t('workspace.current')}</small>}
                </td>
                <td className={styles.versionDate}>
                  <time dateTime={version.createdAt}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium'
                    }).format(date)}
                  </time>
                </td>
                <td className={styles.versionTime}>
                  {new Intl.DateTimeFormat(locale, {
                    hour: '2-digit',
                    minute: '2-digit'
                  }).format(date)}
                </td>
                <td className={styles.versionSummary}>
                  {version.summary || version.changeType}
                </td>
                <td className={styles.versionAction}>
                  {current ? (
                    <span aria-hidden="true">—</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => w.restoreVersion(version.id)}
                    >
                      <RotateCcw />
                      {t('workspace.restore')}
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
