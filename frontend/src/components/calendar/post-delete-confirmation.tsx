'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useTranslations } from 'next-intl'
import type { ContentPlatform } from '@/lib/content-calendar'
import styles from './post-delete-confirmation.module.css'
import theme from './publishing-theme.module.css'

export function PostDeleteConfirmation({ busy, deleting, error, canDeleteFromFacebook, requiresManualInstagramDelete, platforms, onPlatformsChange, onCancel, onConfirm }: {
  busy: boolean
  deleting: boolean
  error?: string
  canDeleteFromFacebook: boolean
  requiresManualInstagramDelete: boolean
  platforms: ContentPlatform[]
  onPlatformsChange: (platforms: ContentPlatform[]) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useTranslations('contentCalendar')
  return <Dialog open onOpenChange={open => { if (!open && !busy) onCancel() }}>
    <DialogContent className={`${theme.surface} ${styles.dialog}`} overlayClassName={theme.overlay} data-publish-surface="" onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => { if (busy) event.preventDefault() }}>
      <span className={styles.sheetHandle} aria-hidden="true" />
      <DialogTitle className={styles.title}>{t('dialog.deleteTitle')}</DialogTitle>
      <DialogDescription className={styles.description}>{t('dialog.deleteSummary')}</DialogDescription>
      {canDeleteFromFacebook && <label className={styles.remoteDelete}>
        <input type="checkbox" disabled={busy} checked={platforms.includes('facebook')} onChange={event => onPlatformsChange(event.target.checked ? ['facebook'] : [])} />
        {t('dialog.deleteFromFacebook')}
      </label>}
      {requiresManualInstagramDelete && <p className={styles.warning}>{t('dialog.instagramManualDeleteDescription')}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className={styles.actions}>
        <Button type="button" variant="outline" className={styles.cancel} disabled={busy} onClick={onCancel}>{t('actions.keep')}</Button>
        <Button type="button" variant="destructive" className={styles.confirm} disabled={busy} onClick={onConfirm}>{deleting && <LoadingIndicator className="size-4" />}{t(deleting ? 'actions.deleting' : 'actions.confirmDelete')}</Button>
      </div>
    </DialogContent>
  </Dialog>
}
