'use client'

import {
  OverlayActions,
  OverlayDescription,
  OverlayTitle,
  ReferenceOverlay
} from '@/components/shared/reference-overlay'
import type { PublishingAccount } from '@/lib/publishing'
import { useTranslations } from 'next-intl'
import styles from './calendar-account-panel.module.css'

/** Confirms a disconnect before the account is removed; mounted by the parent, never inside a popover. */
export function DisconnectConfirmation({
  account,
  providerName,
  busy,
  mobile,
  onCancel,
  onConfirm
}: {
  account: PublishingAccount | null
  providerName: string
  busy: boolean
  mobile: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useTranslations('contentCalendar.connections')
  return (
    <ReferenceOverlay
      open={account !== null}
      alert
      mobile={mobile}
      busy={busy}
      onClose={onCancel}
    >
      <div className={styles.confirmHead}>
        <OverlayTitle mobile={mobile}>{t('disconnectTitle')}</OverlayTitle>
        <OverlayDescription mobile={mobile}>
          {account
            ? t('disconnectDescription', {
                account: account.username || account.name,
                provider: providerName
              })
            : ''}
        </OverlayDescription>
      </div>
      <OverlayActions
        cancel={t('cancel')}
        confirm={t('confirmDisconnect')}
        tone="danger"
        busy={busy}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </ReferenceOverlay>
  )
}
