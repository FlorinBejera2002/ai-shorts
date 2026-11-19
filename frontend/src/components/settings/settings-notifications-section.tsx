'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { FolderKanban, Gift, LockKeyhole, MailX, Send, Sparkles, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { SettingsLoadState } from './settings-load-state'
import { FieldError, IconCircle, SettingsCard, Switch } from './settings-ui'
import type { NotificationKey, SettingsPanelsController } from './use-settings-panels'
import styles from './settings.module.css'

type Props = { panels: SettingsPanelsController; mobile: boolean }

function NotificationRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <IconCircle>
        <Icon aria-hidden="true" />
      </IconCircle>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowTrail}>{children}</span>
    </div>
  )
}

const EMAIL: { key: NotificationKey; label: string; icon: LucideIcon }[] = [
  { key: 'emailProduct', label: 'productEmails', icon: Sparkles },
  { key: 'emailMarketing', label: 'marketingEmails', icon: Gift }
]
const IN_APP: { key: NotificationKey; label: string; icon: LucideIcon }[] = [
  { key: 'inAppProcessing', label: 'processingNotifications', icon: FolderKanban },
  { key: 'inAppPublishing', label: 'publishingNotifications', icon: Send }
]

/** "Notificări": each switch saves immediately; security e-mails stay on. */
export function SettingsNotificationsSection({ panels, mobile }: Props) {
  const t = useTranslations('settings')
  const saved = panels.data?.preferences
  if (!saved) return <SettingsLoadState error={panels.error} onRetry={panels.reload} />
  const toggle = ({ key, label, icon }: (typeof EMAIL)[number]) => (
    <NotificationRow key={key} icon={icon} label={t(label)}>
      <Switch
        checked={saved[key]}
        label={t(label)}
        disabled={panels.disabled}
        busy={panels.busy === `notification-${key}`}
        onChange={(value) => void panels.saveNotification(key, value)}
        data-settings-notification={key}
      />
    </NotificationRow>
  )
  return (
    <>
      <SettingsCard list title={t('page.emailGroup')} data-settings-card="email-notifications">
        <NotificationRow icon={LockKeyhole} label={t(mobile ? 'page.securityShort' : 'securityEmails')}>
          <span className={styles.meta}>{t('page.alwaysOn')}</span>
          <Switch checked locked label={t('securityEmails')} data-settings-notification="emailSecurity" />
        </NotificationRow>
        {EMAIL.map(toggle)}
        <NotificationRow icon={MailX} label={t('page.allOptionalEmails')}>
          <button
            type="button"
            className={`${ui.button} ${ui.secondary} ${ui.focus} ${styles.unsubscribe}`}
            disabled={panels.disabled || (!saved.emailProduct && !saved.emailMarketing)}
            aria-busy={panels.busy === 'unsubscribe' || undefined}
            onClick={() => void panels.unsubscribeOptional()}
            data-settings-unsubscribe=""
          >
            {t('page.unsubscribe')}
          </button>
        </NotificationRow>
      </SettingsCard>
      <SettingsCard list title={t('panelsDesign.inAppGroup')} data-settings-card="app-notifications">
        {IN_APP.map(toggle)}
      </SettingsCard>
      <FieldError message={panels.errorFor('notifications')} />
    </>
  )
}
