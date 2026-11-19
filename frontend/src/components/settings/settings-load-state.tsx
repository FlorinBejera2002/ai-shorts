'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useTranslations } from 'next-intl'
import styles from './settings.module.css'

/** Loading spinner, or the load error with a retry button. */
export function SettingsLoadState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const t = useTranslations('settings')
  return (
    <div className={styles.state} role={error ? 'alert' : 'status'} data-settings-state={error ? 'error' : 'loading'}>
      {error ? null : <LoadingIndicator className="size-8" />}
      <p>{t(error ? 'workspaceDesign.loadError' : 'workspaceDesign.loading')}</p>
      {error && (
        <button type="button" className={`${ui.button} ${ui.primary} ${ui.focus}`} onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </div>
  )
}
