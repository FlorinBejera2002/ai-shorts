'use client'

import { CloseButton, OverlayActions, OverlayTitle, ReferenceOverlay } from '@/components/shared/reference-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { FormEvent } from 'react'
import { SettingsCodeInput } from './settings-code-input'
import { SettingsQrCode } from './settings-qr-code'
import { FieldError, TextField } from './settings-ui'
import type { SettingsPanelsController } from './use-settings-panels'
import controls from './settings-controls.module.css'

type Props = { panels: SettingsPanelsController; mobile: boolean }

/** The key in groups of four, split into two halves that wrap as whole lines. */
function keyHalves(secret: string) {
  const groups = secret.match(/.{1,4}/g) ?? [secret]
  const middle = Math.ceil(groups.length / 2)
  return [groups.slice(0, middle).join(' '), groups.slice(middle).join(' ')] as const
}

function SetupView({ panels, mobile }: Props) {
  const t = useTranslations('settings')
  const secret = panels.setup?.secret ?? ''
  const [first, second] = keyHalves(secret)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void panels.enableMFA()
  }
  return (
    <form className={controls.twoFactor} onSubmit={submit} data-settings-two-factor="setup">
      <div className={controls.scan}>
        {panels.setup && (
          <span className={controls.qr}>
            <SettingsQrCode value={panels.setup.provisionerUri} label={t('page.qrLabel')} />
          </span>
        )}
        <span className={controls.scanCopy}>
          <img src="/illustrations/settings-two-factor.webp" alt={t('page.twoFactorIllustration')} width={132} height={132} />
          <span>{t('page.scanCode')}</span>
        </span>
      </div>
      <div className={controls.key}>
        {!mobile && <span>{t('page.manualKey')}</span>}
        <code data-settings-secret="">
          <span>{first}</span>
          {second && (
            <>
              {' '}
              <span>{second}</span>
            </>
          )}
        </code>
        <button
          type="button"
          className={`${ui.button} ${ui.ghost} ${ui.focus}`}
          aria-label={mobile ? t('page.copyKey') : undefined}
          onClick={() => void panels.copy(secret)}
          data-settings-copy-secret=""
        >
          <Copy aria-hidden="true" />
          {t('copy')}
        </button>
      </div>
      <SettingsCodeInput value={panels.mfaCode} label={t('verificationCode')} disabled={panels.busy !== null} onChange={panels.setMfaCode} />
      <FieldError message={panels.codeError} />
      <OverlayActions
        cancel={t('cancel')}
        confirm={t('page.activate')}
        tone="primary"
        submit
        busy={panels.busy === 'mfa-enable'}
        disabled={!/^\d{6}$/.test(panels.mfaCode)}
        onCancel={panels.closeTwoFactor}
      />
    </form>
  )
}

function RecoveryView({ panels }: Props) {
  const t = useTranslations('settings')
  return (
    <div className={controls.twoFactor} data-settings-two-factor="recovery">
      <p className={ui.dialogText}>{t('saveRecoveryCodes')}</p>
      <ul className={controls.codes} data-settings-recovery-codes="">
        {panels.recoveryCodes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className={ui.actions}>
        <button type="button" className={`${ui.button} ${ui.secondary} ${ui.focus}`} onClick={() => void panels.copy(panels.recoveryCodes.join('\n'))} data-settings-copy-codes="">
          <Copy aria-hidden="true" />
          {t('copyAll')}
        </button>
        <button type="button" className={`${ui.button} ${ui.primary} ${ui.focus}`} onClick={panels.closeTwoFactor} data-settings-two-factor-done="">
          {t('page.done')}
        </button>
      </div>
    </div>
  )
}

function ManageView({ panels }: Props) {
  const t = useTranslations('settings')
  const ready = panels.mfaCode.trim().length >= 6
  return (
    <div className={controls.twoFactor} data-settings-two-factor="manage">
      <TextField
        label={t('verificationOrRecoveryCode')}
        value={panels.mfaCode}
        autoComplete="one-time-code"
        maxLength={64}
        disabled={panels.busy !== null}
        onChange={(event) => panels.setMfaCode(event.target.value)}
        data-settings-mfa-code=""
      />
      <FieldError message={panels.codeError} />
      <div className={ui.actions}>
        <button
          type="button"
          className={`${ui.button} ${ui.secondary} ${ui.focus}`}
          disabled={!ready || panels.busy !== null}
          aria-busy={panels.busy === 'mfa-recovery-codes' || undefined}
          onClick={() => void panels.manageMFA('recovery-codes')}
          data-settings-new-codes=""
        >
          {t('newRecoveryCodes')}
        </button>
        <button
          type="button"
          className={`${ui.button} ${ui.danger} ${ui.focus}`}
          disabled={!ready || panels.busy !== null}
          aria-busy={panels.busy === 'mfa-disable' || undefined}
          onClick={() => void panels.manageMFA('disable')}
          data-settings-disable-mfa=""
        >
          {t('disableTwoFactor')}
        </button>
      </div>
    </div>
  )
}

/** Set up, manage or finish two-factor authentication; a bottom sheet on phones. */
export function TwoFactorDialog({ panels, mobile }: Props) {
  const t = useTranslations('settings')
  const view = panels.twoFactorView
  const busy = panels.busy?.startsWith('mfa-') ?? false
  return (
    <ReferenceOverlay open={view !== null} mobile={mobile} busy={busy} described={false} onClose={panels.closeTwoFactor}>
      <div className={controls.dialogHead}>
        <OverlayTitle mobile={mobile}>{t('twoFactor')}</OverlayTitle>
        <CloseButton onClick={panels.closeTwoFactor} />
      </div>
      {view === 'setup' && <SetupView panels={panels} mobile={mobile} />}
      {view === 'recovery' && <RecoveryView panels={panels} mobile={mobile} />}
      {view === 'manage' && <ManageView panels={panels} mobile={mobile} />}
    </ReferenceOverlay>
  )
}
