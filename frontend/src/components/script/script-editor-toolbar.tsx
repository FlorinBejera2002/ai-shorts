'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Archive,
  ArrowLeft,
  CircleAlert,
  Clock,
  Copy,
  Download
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import styles from './scripts-workspace.module.css'

const STATUSES = [
  'idea',
  'draft',
  'review',
  'ready',
  'in_production',
  'published'
]

export function ScriptEditorToolbar({
  workspace: w
}: {
  workspace: ScriptsWorkspace
}) {
  const t = useTranslations('scriptGenerator')
  const locale = useLocale()
  const archived = w.status === 'archived'

  return (
    <div className={styles.toolbar} data-script-toolbar="">
      <div className={styles.toolbarContext}>
        <Button variant="outline" onClick={w.backToLibrary}>
          <ArrowLeft />
          {t('workspace.backToLibrary')}
        </Button>
        <div className={styles.statusSelect}>
          <Label htmlFor="script-status" className="sr-only">
            {t('workspace.statusLabel')}
          </Label>
          <Select
            value={w.status}
            onValueChange={w.setStatus}
            disabled={archived}
          >
            <SelectTrigger id="script-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {(archived ? [...STATUSES, 'archived'] : STATUSES).map(
                (status) => (
                  <SelectItem key={status} value={status}>
                    {t(`workspace.status.${status}`)}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
        <div
          className={styles.saveStatus}
          data-save-state={w.saveState}
          role="status"
          aria-live="polite"
        >
          <span>
            {w.saveState === 'error' && <CircleAlert aria-hidden="true" />}
            {w.saveState === 'saving'
              ? t('workspace.saving')
              : w.saveState === 'error'
                ? t('workspace.saveError')
                : t('workspace.saved', { revision: w.revision })}
          </span>
          {w.saveState === 'error' ? (
            <Button size="xs" onClick={w.retrySave}>
              {t('workspace.retrySave')}
            </Button>
          ) : (
            w.updatedAt && (
              <time dateTime={w.updatedAt}>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium'
                }).format(new Date(w.updatedAt))}
              </time>
            )
          )}
        </div>
      </div>
      <div className={styles.toolbarActions}>
        <Button
          variant="outline"
          aria-expanded={w.showVersions}
          aria-controls="script-version-history"
          onClick={w.loadVersions}
        >
          <Clock />
          {t('workspace.versions')}
        </Button>
        <Button variant="outline" onClick={w.copyScript}>
          <Copy />
          {t('copyAll')}
        </Button>
        <Button
          variant="outline"
          onClick={w.downloadScript}
          title={t('workspace.downloadJson')}
        >
          <Download />
          {t('download')}
        </Button>
        <Button variant="outline" disabled={archived} onClick={w.archiveScript}>
          <Archive />
          {t('workspace.archive')}
        </Button>
      </div>
    </div>
  )
}
