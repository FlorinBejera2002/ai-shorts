'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link } from '@/i18n/navigation'
import { Download, ExternalLink, TriangleAlert, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef } from 'react'
import type { AccountSettingsController } from './use-account-settings'
import { SettingsFeedback } from './settings-feedback'
import { SettingsGoogleIcon } from './settings-google-icon'
import styles from './settings-workspace.module.css'

export function SettingsPrivacyIntro({
  account
}: {
  account: AccountSettingsController
}) {
  const t = useTranslations('settings')
  return (
    <>
      <h2 id="privacy-title" className={styles.privacyHeading}>
        {t('workspaceDesign.privacy')}
      </h2>
      <div className={styles.policyLinks}>
        <Link href="/privacy" target="_blank" rel="noopener noreferrer">
          {t('privacyPolicy')}
          <ExternalLink />
        </Link>
        <Link href="/terms" target="_blank" rel="noopener noreferrer">
          {t('workspaceDesign.terms')}
          <ExternalLink />
        </Link>
      </div>
      <section className={styles.exportSection} aria-labelledby="export-title">
        <h3 id="export-title">{t('workspaceDesign.exportTitle')}</h3>
        <p className={styles.hint}>{t('workspaceDesign.exportDescription')}</p>
        <Button
          type="button"
          onClick={account.exportData}
          disabled={account.blocked}
          aria-busy={account.busy === 'export'}
          data-settings-export=""
        >
          <Download />
          {t('exportData')}
        </Button>
        <p className={styles.hint}>{t('workspaceDesign.jsonFile')}</p>
        <SettingsFeedback message={account.errors.export} />
        <SettingsFeedback
          message={account.exported ? t('exportSuccess') : undefined}
          success
        />
      </section>
    </>
  )
}

export function SettingsPrivacyFooter({
  account
}: {
  account: AccountSettingsController
}) {
  const t = useTranslations('settings')
  return (
    <section className={styles.deleteSection} aria-labelledby="delete-title">
      <h3 id="delete-title">{t('deleteAccount')}</h3>
      <p className={styles.hint}>{t('workspaceDesign.deleteHint')}</p>
      <Button
        variant="outline"
        className={styles.dangerButton}
        onClick={() => account.onDeleteOpenChange(true)}
        disabled={account.blocked}
        data-settings-delete-open=""
      >
        {t('deleteAccount')}
      </Button>
    </section>
  )
}

export function SettingsDeleteDialog({
  account
}: {
  account: AccountSettingsController
}) {
  const t = useTranslations('settings')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const credential = account.profile.canChangePassword
  return (
    <Dialog open={account.deleteOpen} onOpenChange={account.onDeleteOpenChange}>
      <DialogContent
        className={styles.deleteDialog}
        data-settings-delete-dialog=""
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (account.blocked) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (account.blocked) event.preventDefault()
        }}
      >
        <div className={styles.dialogHeading}>
          <DialogTitle>{t('workspaceDesign.deleteTitle')}</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('cancel')}
            disabled={account.blocked}
            onClick={() => account.onDeleteOpenChange(false)}
          >
            <X />
          </Button>
        </div>
        <div className={styles.warning}>
          <TriangleAlert aria-hidden="true" />
          <span>{t('workspaceDesign.subscriptionWarning')}</span>
        </div>
        <DialogDescription>
          {t('workspaceDesign.deleteDescription')}
        </DialogDescription>
        <form onSubmit={account.deleteAccount}>
          <fieldset disabled={account.blocked} className={styles.deleteFields}>
            <div className={styles.field}>
              <Label htmlFor="delete-confirmation">
                {t('workspaceDesign.confirmEmail')}
              </Label>
              <Input
                id="delete-confirmation"
                type="email"
                value={account.deleteConfirmation}
                onChange={(event) =>
                  account.setDeleteConfirmation(event.target.value)
                }
                required
                autoComplete="email"
              />
            </div>
            {credential ? (
              <div className={styles.field}>
                <Label htmlFor="delete-password">{t('currentPassword')}</Label>
                <Input
                  id="delete-password"
                  type="password"
                  placeholder={t('workspaceDesign.enterPassword')}
                  value={account.deletePassword}
                  onChange={(event) =>
                    account.setDeletePassword(event.target.value)
                  }
                  maxLength={128}
                  required
                  autoComplete="current-password"
                  aria-describedby="delete-password-hint"
                />
                <p id="delete-password-hint" className={styles.hint}>
                  {t('workspaceDesign.passwordContinue')}
                </p>
              </div>
            ) : (
              <div className={styles.reauthentication}>
                <p className={styles.hint}>
                  {t(
                    account.profile.recentlyAuthenticated
                      ? 'workspaceDesign.identityConfirmed'
                      : 'workspaceDesign.confirmIdentity'
                  )}
                </p>
                {!account.profile.recentlyAuthenticated && (
                  <Button
                    type="button"
                    onClick={account.reauthenticate}
                    aria-busy={account.busy === 'reauthenticate'}
                  >
                    {account.profile.provider === 'google' && (
                      <SettingsGoogleIcon />
                    )}
                    {t('reauthenticate')}
                  </Button>
                )}
              </div>
            )}
            <SettingsFeedback
              message={account.errors.delete || account.errors.reauthenticate}
            />
            <div className={styles.dialogFooter}>
              <Button
                ref={cancelRef}
                type="button"
                variant="outline"
                onClick={() => account.onDeleteOpenChange(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!account.deletionValid}
                aria-busy={account.busy === 'delete'}
                data-settings-delete-submit=""
              >
                {t('deletePermanently')}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}
