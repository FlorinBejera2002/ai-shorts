'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import shared from './scripts-workspace.module.css'
import styles from './script-editor.module.css'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Saved, saving and failed states from the reference's "Salvare" panel. */
export function ScriptSaveStatus({
  state,
  revision,
  compact,
  onRetry
}: {
  state: SaveState
  revision: number
  compact: boolean
  onRetry: () => void
}) {
  const t = useTranslations('scriptGenerator')

  if (state === 'error') {
    return (
      <div className={styles.saveError} role="alert" data-save-state={state}>
        <span>{t('workspace.saveError')}</span>
        <button type="button" onClick={onRetry}>
          {t('workspace.retry')}
        </button>
      </div>
    )
  }

  return (
    <span
      className={styles.saveStatus}
      data-save-state={state}
      role="status"
      aria-live="polite"
    >
      {state === 'saving' ? (
        <>
          <span className={shared.spinner} aria-hidden="true" />
          {t('workspace.saving')}
        </>
      ) : (
        <>
          <Check className={styles.savedIcon} aria-hidden="true" />
          {compact ? (
            <>
              <span className="sr-only">{t('workspace.savedShort')} · </span>v
              {revision}
            </>
          ) : (
            t('workspace.saved', { revision })
          )}
        </>
      )}
    </span>
  )
}
