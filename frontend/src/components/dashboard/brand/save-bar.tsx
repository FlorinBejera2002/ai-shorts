'use client'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Check, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './save-bar.module.css'

type SaveBarProps = {
  dirty: boolean
  saving: boolean
  saved: boolean
  logoBusy: boolean
  fontBusy?: boolean
  hasInvalidColor: boolean
  onDiscard: () => void
  onReset: () => void
  onSave: () => Promise<void>
}

export function SaveBar({
  dirty,
  saving,
  logoBusy,
  fontBusy = false,
  hasInvalidColor,
  onDiscard,
  onReset,
  onSave
}: SaveBarProps) {
  const t = useTranslations('brand')
  const common = useTranslations('common')
  const busy = saving || logoBusy || fontBusy
  const state = saving ? 'saving' : dirty ? 'unsaved' : 'saved'

  return (
    <div className={styles.bar} data-brand-save-bar="">
      <Button
        type="button"
        variant="ghost"
        onClick={onReset}
        disabled={busy}
        className={styles.reset}
      >
        <RotateCcw aria-hidden="true" />
        {common('reset')}
      </Button>
      <div
        role="status"
        className={styles.status}
        data-brand-save-state={state}
      >
        {saving ? (
          <LoadingIndicator className="size-4" />
        ) : dirty ? (
          <span className={styles.dot} aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        <span>
          {t(
            saving
              ? 'workspaceDesign.saving'
              : dirty
                ? 'workspaceDesign.unsaved'
                : 'workspaceDesign.saved'
          )}
        </span>
      </div>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="outline"
          onClick={onDiscard}
          disabled={!dirty || busy}
        >
          {t('discard')}
        </Button>
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={!dirty || busy || hasInvalidColor}
          title={hasInvalidColor ? t('fixColors') : undefined}
        >
          {saving && <LoadingIndicator />}
          {t('workspaceDesign.saveChanges')}
        </Button>
      </div>
    </div>
  )
}
