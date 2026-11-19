'use client'

import {
  DeleteIllustration,
  OverlayActions,
  OverlayDescription,
  OverlayTitle,
  ReferenceOverlay
} from '@/components/shared/reference-overlay'
import overlay from '@/components/shared/reference-ui.module.css'
import { useIsMobile } from '@/hooks/use-mobile'
import type { ContentPlatform } from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'
import styles from './post-delete-confirmation.module.css'

export function PostDeleteConfirmation({
  busy,
  deleting,
  error,
  canDeleteFromFacebook,
  requiresManualInstagramDelete,
  platforms,
  onPlatformsChange,
  onCancel,
  onConfirm
}: {
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
  const mobile = useIsMobile()
  return (
    <ReferenceOverlay open alert busy={busy} mobile={mobile} onClose={onCancel}>
      <div className={overlay.dialogHead}>
        <DeleteIllustration alt={t('illustrations.delete')} />
        <OverlayTitle mobile={mobile}>{t('dialog.deleteTitle')}</OverlayTitle>
        <OverlayDescription mobile={mobile}>
          {t('dialog.deleteSummary')}
        </OverlayDescription>
      </div>
      {canDeleteFromFacebook && (
        <label className={styles.remoteDelete}>
          <input
            type="checkbox"
            disabled={busy}
            checked={platforms.includes('facebook')}
            onChange={(event) =>
              onPlatformsChange(event.target.checked ? ['facebook'] : [])
            }
          />
          {t('dialog.deleteFromFacebook')}
        </label>
      )}
      {requiresManualInstagramDelete && (
        <p className={styles.warning}>
          {t('dialog.instagramManualDeleteDescription')}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <OverlayActions
        cancel={t('actions.keep')}
        confirm={t(deleting ? 'actions.deleting' : 'actions.confirmDelete')}
        tone="danger"
        busy={busy}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </ReferenceOverlay>
  )
}
