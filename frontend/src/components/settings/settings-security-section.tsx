'use client'

import ui from '@/components/shared/reference-ui.module.css'
import type { AccountSession } from '@/lib/settings'
import { Monitor, ShieldCheck, Smartphone } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { SettingsLoadState } from './settings-load-state'
import { Chevron, FieldError, IconCircle, Pill, SettingsCard, StatusDot, TextField } from './settings-ui'
import { useMountTime } from './use-mount-time'
import type { AccountSettingsController } from './use-account-settings'
import type { SettingsPanelsController } from './use-settings-panels'
import styles from './settings.module.css'
import controls from './settings-controls.module.css'

type Props = { account: AccountSettingsController; panels: SettingsPanelsController; mobile: boolean }

function PasswordCard({ account }: Pick<Props, 'account'>) {
  const t = useTranslations('settings')
  if (!account.profile.canChangePassword)
    return (
      <SettingsCard title={t('workspaceDesign.password')} data-settings-card="password">
        <p className={styles.meta}>{t('providerPassword', { provider: account.profile.provider === 'google' ? t('page.google') : account.profile.provider })}</p>
      </SettingsCard>
    )
  const filled = account.currentPassword && account.newPassword && account.confirmPassword
  return (
    <SettingsCard title={t('workspaceDesign.password')} data-settings-card="password">
      <form className={styles.form} onSubmit={account.changePassword}>
        <div className={controls.fields} data-columns="3">
          <TextField
            label={t('currentPassword')}
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={account.currentPassword}
            disabled={account.blocked}
            onChange={(event) => account.setCurrentPassword(event.target.value)}
          />
          <TextField
            label={t('newPassword')}
            type="password"
            autoComplete="new-password"
            maxLength={128}
            placeholder={t('page.passwordPlaceholder')}
            value={account.newPassword}
            disabled={account.blocked}
            onChange={(event) => account.setNewPassword(event.target.value)}
          />
          <TextField
            label={t('confirmPassword')}
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={account.confirmPassword}
            disabled={account.blocked}
            onChange={(event) => account.setConfirmPassword(event.target.value)}
          />
        </div>
        <FieldError message={account.errors.password} />
        <div className={styles.actions}>
          <button
            type="submit"
            className={`${ui.button} ${ui.primary} ${ui.focus}`}
            disabled={account.blocked || !filled}
            aria-busy={account.busy === 'password' || undefined}
            data-settings-password-save=""
          >
            {t('changePassword')}
          </button>
        </div>
      </form>
    </SettingsCard>
  )
}

function TwoFactorCard({ panels, mobile }: Pick<Props, 'panels' | 'mobile'>) {
  const t = useTranslations('settings')
  const enabled = panels.data?.mfa.enabled === true
  const badge = <Pill>{t(enabled ? 'enabled' : 'disabled')}</Pill>
  const opening = panels.busy === 'mfa-setup'
  return (
    <section className={styles.card} data-settings-card="two-factor">
      {mobile ? (
        <button
          type="button"
          className={`${styles.row} ${styles.rowButton} ${styles.focus}`}
          disabled={panels.disabled}
          aria-busy={opening || undefined}
          onClick={() => void panels.openTwoFactor()}
          data-settings-two-factor-open=""
        >
          <IconCircle>
            <ShieldCheck aria-hidden="true" />
          </IconCircle>
          <span className={styles.twoFactorText}>
            <b className={styles.strong}>{t('twoFactor')}</b>
            {badge}
          </span>
          <Chevron />
        </button>
      ) : (
        <div className={styles.row}>
          <IconCircle large>
            <ShieldCheck aria-hidden="true" />
          </IconCircle>
          <span className={styles.twoFactorText}>
            <h2 className={styles.cardTitle}>{t('twoFactor')}</h2>
            {badge}
          </span>
          <button
            type="button"
            className={`${ui.button} ${enabled ? ui.secondary : ui.primary} ${ui.focus}`}
            disabled={panels.disabled}
            aria-busy={opening || undefined}
            onClick={() => void panels.openTwoFactor()}
            data-settings-two-factor-open=""
          >
            {t(enabled ? 'page.manage' : 'page.configure')}
          </button>
        </div>
      )}
      {!panels.twoFactorView && <FieldError message={panels.errorFor('mfa')} />}
    </section>
  )
}

const DEVICE = /^(.+) on (.+)$/

function useSessionLabels() {
  const t = useTranslations('settings.page')
  const locale = useLocale()
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const now = useMountTime()
  return {
    device(session: AccountSession) {
      const match = DEVICE.exec(session.device)
      if (!match) return session.device
      const platform = match[2] === 'Unknown device' ? t('unknownDevice') : match[2]!
      return t('device', { browser: match[1]!, platform })
    },
    seen(session: AccountSession) {
      const seconds = Math.round((new Date(session.lastSeenAt).getTime() - now) / 1000)
      if (Math.abs(seconds) < 60) return relative.format(0, 'second')
      if (Math.abs(seconds) < 3600) return relative.format(Math.round(seconds / 60), 'minute')
      if (Math.abs(seconds) < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
      return relative.format(Math.round(seconds / 86400), 'day')
    }
  }
}

function SessionsCard({ panels, mobile }: Pick<Props, 'panels' | 'mobile'>) {
  const t = useTranslations('settings')
  const labels = useSessionLabels()
  const sessions = panels.data?.sessions ?? []
  const others = sessions.some((session) => !session.current)
  const revokeOthers = (
    <button
      type="button"
      className={`${ui.button} ${ui.secondary} ${ui.focus} ${styles.small} ${styles.dangerText}`}
      disabled={panels.disabled || !others}
      aria-busy={panels.busy === 'sessions' || undefined}
      onClick={() => void panels.revokeOthers()}
      data-settings-revoke-others=""
    >
      {t('page.revokeOthers')}
    </button>
  )
  return (
    <section className={`${styles.card} ${mobile ? styles.listCard : ''}`} data-settings-card="sessions">
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{t('activeSessions')}</h2>
        {!mobile && revokeOthers}
      </div>
      <div className={styles.sessions}>
        {sessions.map((session) => (
          <div key={session.id} className={styles.row} data-settings-session={session.id}>
            <IconCircle>{/iOS|Android/.test(session.device) ? <Smartphone aria-hidden="true" /> : <Monitor aria-hidden="true" />}</IconCircle>
            <span className={styles.stack}>
              <span className={styles.strong}>{labels.device(session)}</span>
              <span className={styles.meta}>{labels.seen(session)}</span>
            </span>
            {session.current ? (
              <StatusDot tone="ok">{t(mobile ? 'page.currentShort' : 'currentSession')}</StatusDot>
            ) : (
              <button
                type="button"
                className={`${ui.button} ${ui.secondary} ${ui.focus} ${styles.small}`}
                disabled={panels.disabled}
                aria-busy={panels.busy === `session-${session.id}` || undefined}
                onClick={() => void panels.revokeSession(session.id, false)}
                data-settings-revoke={session.id}
              >
                {t('revoke')}
              </button>
            )}
          </div>
        ))}
        {!sessions.length && <p className={styles.meta}>{t('panelsDesign.noSessions')}</p>}
      </div>
      {mobile && revokeOthers}
      <FieldError message={panels.errorFor('sessions')} />
    </section>
  )
}

/** "Securitate": password, two-factor authentication and active sessions. */
export function SettingsSecuritySection(props: Props) {
  const { panels } = props
  return (
    <>
      <PasswordCard account={props.account} />
      {panels.data ? (
        <>
          <TwoFactorCard panels={panels} mobile={props.mobile} />
          <SessionsCard panels={panels} mobile={props.mobile} />
        </>
      ) : (
        <SettingsLoadState error={panels.error} onRetry={panels.reload} />
      )}
    </>
  )
}
