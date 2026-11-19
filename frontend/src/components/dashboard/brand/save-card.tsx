'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import ui from '@/components/shared/reference-ui.module.css'
import { Check, ChevronDown, Plus, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenu as Menu } from 'radix-ui'
import { useEffect, useState } from 'react'
import type { BrandKitController } from './brand-workspace-types'
import { brandPortal } from './editor-utils'
import styles from './brand-editor.module.css'

/** "Salvează ca kit nou" next to Salvează, for kits from the kits API. */
function SaveMenu({ kitName, disabled, dirty, onSave, onSaveAs }: { kitName: string; disabled: boolean; dirty: boolean; onSave: () => void; onSaveAs: () => void }) {
  const kits = useTranslations('brandKits')
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className={`${styles.button} ${styles.primary} ${styles.splitMore} ${styles.focus}`} disabled={disabled} aria-label={kits('moreSaveOptions')}>
          <ChevronDown aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" side="top" sideOffset={8} className={`${brandPortal} ${ui.menu}`} data-reference-surface="">
          <Menu.Item className={ui.item} disabled={!dirty} onSelect={onSave}>
            <Check aria-hidden="true" />
            <span>{kits('saveInto', { name: kitName })}</span>
          </Menu.Item>
          <Menu.Item className={ui.item} onSelect={onSaveAs}>
            <Plus aria-hidden="true" />
            <span>{kits('saveAsNew')}</span>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Save state under the preview: "Totul este salvat" + Resetează, or "Modificări nesalvate" + Renunță / Salvează. */
export function SaveCard({ brand, fontBusy, onSaveAs }: { brand: BrandKitController; fontBusy: boolean; onSaveAs?: () => void }) {
  const t = useTranslations('brand')
  const common = useTranslations('common')
  const busy = brand.saving || brand.logoBusy || fontBusy
  const state = brand.saving ? 'saving' : brand.dirty ? 'unsaved' : 'saved'
  const save = () => void brand.save()
  const reset = (
    <button type="button" className={`${styles.button} ${styles.secondary} ${styles.smallButton} ${styles.focus}`} disabled={busy} onClick={brand.reset}>
      <RotateCcw aria-hidden="true" />
      {common('reset')}
    </button>
  )
  if (state === 'saved')
    return (
      <section className={`${styles.card} ${styles.saveCard}`} aria-label={t('editor.saveCard')} data-brand-save-bar="" data-brand-save-state={state}>
        <span className={styles.saveStatus} role="status">
          <span className={styles.okIcon} aria-hidden="true">
            <Check />
          </span>
          <b>{t('editor.allSaved')}</b>
        </span>
        {reset}
      </section>
    )
  return (
    <section className={`${styles.card} ${styles.saveCard}`} aria-label={t('unsaved')} data-brand-save-bar="" data-brand-save-state={state}>
      <span className={styles.saveStatus} role="status">
        <span className={styles.dot} aria-hidden="true" />
        <b>{t(state === 'saving' ? 'workspaceDesign.saving' : 'unsaved')}</b>
      </span>
      <span className={styles.saveActions}>
        <button type="button" className={`${styles.button} ${styles.secondary} ${styles.focus}`} disabled={busy} onClick={brand.discard}>
          {t('discard')}
        </button>
        <span className={styles.split}>
          <button
            type="button"
            className={`${styles.button} ${styles.primary} ${styles.focus}`}
            disabled={busy || brand.hasInvalidColor}
            title={brand.hasInvalidColor ? t('fixColors') : undefined}
            data-split={onSaveAs ? '' : undefined}
            onClick={save}
          >
            {brand.saving ? <LoadingIndicator /> : <Check aria-hidden="true" />}
            {t('editor.save')}
          </button>
          {onSaveAs && (
            <SaveMenu kitName={brand.meta?.name ?? ''} disabled={busy || brand.hasInvalidColor} dirty={brand.dirty} onSave={save} onSaveAs={onSaveAs} />
          )}
        </span>
      </span>
      <button type="button" className={`${styles.button} ${styles.ghost} ${styles.resetDefaults} ${styles.focus}`} disabled={busy} onClick={brand.reset}>
        <RotateCcw aria-hidden="true" />
        {t('editor.resetDefaults')}
      </button>
    </section>
  )
}

/** Canvas Br-Saved: "Kit branding salvat" for a few seconds after a save. */
export function SavedNotice() {
  const t = useTranslations('brand')
  const kits = useTranslations('brandKits')
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(timer)
  }, [])
  if (!visible) return null
  return (
    <div role="status" className={styles.notice} data-brand-saved="">
      <img src="/illustrations/brand-saved.webp" alt={kits('savedIllustration')} width={72} height={72} />
      <span className={styles.noticeCopy}>
        <b className={styles.heading}>{t('kitSaved')}</b>
        <span className={styles.muted}>{t('editor.savedText')}</span>
      </span>
    </div>
  )
}
