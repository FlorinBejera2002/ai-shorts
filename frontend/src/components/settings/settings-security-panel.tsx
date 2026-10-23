import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Smartphone,
  TriangleAlert
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { SettingsPanelFeedback } from './settings-panel-status'
import { SettingsSessionsPanel } from './settings-sessions-panel'
import type { SettingsPanelsController } from './use-settings-panels'
import styles from './settings-panels.module.css'

function MfaStatus({ enabled }: { enabled: boolean }) {
  const t = useTranslations('settings')
  return (
    <span className={enabled ? styles.enabledBadge : styles.neutralBadge}>
      {t(enabled ? 'enabled' : 'disabled')}
    </span>
  )
}

function SecurityOverview({
  controller,
  hint
}: {
  controller: SettingsPanelsController
  hint?: ReactNode
}) {
  const t = useTranslations('settings')
  const enabled = controller.data?.mfa.enabled ?? false
  return (
    <>
      <div className={styles.securityGroup}>
        <h3 className={styles.subheading}>{t('twoFactor')}</h3>
        <div className={styles.authenticatorRow}>
          <span className={styles.authenticatorIcon}>
            <Smartphone aria-hidden="true" />
          </span>
          <div>
            <p>{t('authenticatorApp')}</p>
            <p className={styles.hint}>{t(enabled ? 'mfaOn' : 'mfaOff')}</p>
          </div>
          <MfaStatus enabled={enabled} />
          <Button
            className={styles.mfaSetupAction}
            disabled={controller.disabled}
            onClick={() => void controller.beginMFA()}
            data-settings-mfa-setup={!enabled ? '' : undefined}
            data-settings-mfa-manage={enabled ? '' : undefined}
          >
            {controller.busy === 'mfa-setup' && (
              <LoadingIndicator className="size-4" />
            )}
            {t(enabled ? 'panelsDesign.manageTwoFactor' : 'setUpTwoFactor')}
          </Button>
        </div>
        {hint}
        <SettingsPanelFeedback controller={controller} group="mfa" />
      </div>
      <div className={styles.securityGroup}>
        <button
          type="button"
          className={styles.sectionLink}
          disabled={controller.disabled}
          onClick={() => controller.setView('sessions')}
          data-settings-sessions-open
        >
          <span>
            <strong>{t('activeSessions')}</strong>
            <span className={styles.hint}>{t('activeSessionsDesc')}</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </>
  )
}

function MfaSetup({ controller }: { controller: SettingsPanelsController }) {
  const t = useTranslations('settings')
  const setup = controller.setup
  if (!setup) return null
  return (
    <div className={styles.panel} data-mfa-setup>
      <h2 className={styles.heading}>{t('twoFactor')}</h2>
      <div className={styles.mfaHeading}>
        <Smartphone aria-hidden="true" />
        <span>{t('authenticatorApp')}</span>
        <MfaStatus enabled={false} />
      </div>
      <p className={styles.mfaSetupHint}>{t('mfaSetupHint')}</p>
      <div className={styles.field}>
        <Label htmlFor="mfa-secret" className={styles.label}>
          {t('manualKey')}
        </Label>
        <div className={styles.copyField}>
          <Input
            id="mfa-secret"
            readOnly
            value={setup.secret}
            className={styles.input}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('panelsDesign.copyKey')}
            disabled={controller.disabled}
            onClick={() => void controller.copy(setup.secret)}
            data-settings-mfa-key-copy
          >
            <Copy aria-hidden="true" />
          </Button>
        </div>
      </div>
      <form
        className={styles.mfaForm}
        onSubmit={(event) => {
          event.preventDefault()
          void controller.enableMFA()
        }}
      >
        <div className={styles.field}>
          <Label htmlFor="mfa-confirm-code" className={styles.label}>
            {t('verificationCode')}
          </Label>
          <Input
            id="mfa-confirm-code"
            value={controller.mfaCode}
            onChange={(event) => controller.setMfaCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            disabled={controller.disabled}
            className={styles.input}
          />
        </div>
        <SettingsPanelFeedback controller={controller} group="mfa" />
        {controller.feedback?.group === 'mfa' && controller.feedback.error && (
          <Button
            type="button"
            variant="outline"
            disabled={controller.disabled}
            onClick={() => void controller.beginMFA(true)}
            data-settings-mfa-restart
          >
            {t('panelsDesign.restartSetup')}
          </Button>
        )}
        <Button
          className={styles.primaryAction}
          type="submit"
          disabled={
            controller.disabled || !/^\d{6}$/.test(controller.mfaCode.trim())
          }
          data-settings-mfa-enable
        >
          {controller.busy === 'mfa-enable' && (
            <LoadingIndicator className="size-4" />
          )}
          {t('confirmTwoFactor')}
        </Button>
      </form>
    </div>
  )
}

function RecoveryCodes({
  controller
}: {
  controller: SettingsPanelsController
}) {
  const t = useTranslations('settings')
  if (!controller.recoveryCodes.length) return null
  return (
    <div className={styles.recoveryCodes} data-mfa-recovery>
      <div className={styles.recoveryHeading}>
        <TriangleAlert aria-hidden="true" />
        <div>
          <h3>{t('saveRecoveryCodes')}</h3>
          <p className={styles.hint}>{t('recoveryCodesOnce')}</p>
        </div>
      </div>
      <div className={styles.codesGrid}>
        {controller.recoveryCodes.map((code) => (
          <code key={code}>{code}</code>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        className={styles.copyCodesAction}
        disabled={controller.disabled}
        onClick={() =>
          void controller.copy(controller.recoveryCodes.join('\n'))
        }
        data-settings-mfa-copy
      >
        <Copy aria-hidden="true" />
        {t('panelsDesign.copyAllCodes')}
      </Button>
    </div>
  )
}

function MfaRecovery({ controller }: { controller: SettingsPanelsController }) {
  const t = useTranslations('settings')
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>{t('panelsDesign.security')}</h2>
      <div className={styles.enabledHeading}>
        <h3 className={styles.subheading}>{t('twoFactor')}</h3>
        <MfaStatus enabled />
      </div>
      <p className={styles.hint}>{t('panelsDesign.twoFactorProtected')}</p>
      <div className={styles.mfaApp}>
        <Smartphone aria-hidden="true" />
        <div>
          {t('authenticatorApp')}
          <p className={styles.hint}>{t('mfaOn')}</p>
        </div>
      </div>
      <RecoveryCodes controller={controller} />
      <div className={styles.mfaForm}>
        <div className={styles.field}>
          <Label htmlFor="mfa-action-code" className={styles.label}>
            {t('verificationOrRecoveryCode')}
          </Label>
          <p className={styles.hint} id="mfa-action-code-hint">
            {t('panelsDesign.actionCodeHint')}
          </p>
          <Input
            id="mfa-action-code"
            value={controller.mfaCode}
            onChange={(event) => controller.setMfaCode(event.target.value)}
            autoComplete="one-time-code"
            maxLength={64}
            disabled={controller.disabled}
            className={styles.input}
            placeholder={t('panelsDesign.enterCode')}
            aria-describedby="mfa-action-code-hint"
          />
        </div>
        <SettingsPanelFeedback controller={controller} group="mfa" />
        <div className={styles.mfaActions}>
          <Button
            type="button"
            variant="outline"
            disabled={
              controller.disabled || controller.mfaCode.trim().length < 6
            }
            onClick={() => void controller.manageMFA('recovery-codes')}
            data-settings-mfa-regenerate
          >
            {controller.busy === 'mfa-recovery-codes' && (
              <LoadingIndicator className="size-4" />
            )}
            {t('newRecoveryCodes')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={
              controller.disabled || controller.mfaCode.trim().length < 6
            }
            onClick={() => void controller.manageMFA('disable')}
            data-settings-mfa-disable
          >
            {controller.busy === 'mfa-disable' && (
              <LoadingIndicator className="size-4" />
            )}
            {t('disableTwoFactor')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function SettingsSecurityPanel({
  controller,
  intro,
  hint
}: {
  controller: SettingsPanelsController
  intro?: ReactNode
  hint?: ReactNode
}) {
  const t = useTranslations('settings')
  return (
    <div data-settings-security-view={controller.view}>
      {controller.view !== 'password' && (
        <Button
          type="button"
          variant="ghost"
          className={styles.backAction}
          onClick={() => controller.setView('password')}
          disabled={controller.disabled}
          data-settings-subview-back
        >
          <ArrowLeft aria-hidden="true" />
          {t('panelsDesign.backToSecurity')}
        </Button>
      )}
      <div hidden={controller.view !== 'password'}>
        {intro}
        <SecurityOverview controller={controller} hint={hint} />
      </div>
      <div hidden={controller.view !== 'setup'}>
        <MfaSetup controller={controller} />
      </div>
      <div hidden={controller.view !== 'recovery'}>
        <MfaRecovery controller={controller} />
      </div>
      <div hidden={controller.view !== 'sessions'}>
        <SettingsSessionsPanel controller={controller} />
      </div>
    </div>
  )
}
