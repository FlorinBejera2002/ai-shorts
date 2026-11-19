'use client'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { referenceSurface } from '@/components/shared/reference-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { Check, ChevronDown, Plus, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenu as Menu } from 'radix-ui'
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
  /** Name of the kit being edited, for "Salvează în …". */
  kitName?: string
  /** Opens "Salvează ca kit nou"; omitted when kits are not available. */
  onSaveAs?: () => void
}

export function SaveBar({
  dirty,
  saving,
  logoBusy,
  fontBusy = false,
  hasInvalidColor,
  onDiscard,
  onReset,
  onSave,
  kitName,
  onSaveAs
}: SaveBarProps) {
  const t = useTranslations('brand')
  const kits = useTranslations('brandKits')
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
        <span className={styles.split}>
          <Button
            type="button"
            onClick={() => void onSave()}
            disabled={!dirty || busy || hasInvalidColor}
            title={hasInvalidColor ? t('fixColors') : undefined}
            data-split={onSaveAs ? '' : undefined}
          >
            {saving && <LoadingIndicator />}
            {t('workspaceDesign.saveChanges')}
          </Button>
          {onSaveAs && (
            <Menu.Root modal={false}>
              <Menu.Trigger asChild>
                <Button type="button" className={styles.splitMore} disabled={busy || hasInvalidColor} aria-label={kits('moreSaveOptions')}>
                  <ChevronDown aria-hidden="true" />
                </Button>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content align="end" side="top" sideOffset={8} className={`${referenceSurface} ${ui.menu}`} data-reference-surface="">
                  <Menu.Item className={ui.item} disabled={!dirty} onSelect={() => void onSave()}>
                    <Check aria-hidden="true" />
                    <span>{kits('saveInto', { name: kitName ?? '' })}</span>
                  </Menu.Item>
                  <Menu.Item className={ui.item} onSelect={onSaveAs}>
                    <Plus aria-hidden="true" />
                    <span>{kits('saveAsNew')}</span>
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          )}
        </span>
      </div>
    </div>
  )
}
