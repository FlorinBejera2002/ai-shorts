'use client'

import { CloseButton, DeleteIllustration, OverlayDescription, OverlayTitle, ReferenceOverlay } from '@/components/shared/reference-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SettingsGoogleIcon } from './settings-google-icon'
import { FieldError, TextField } from './settings-ui'
import type { AccountSettingsController } from './use-account-settings'
import controls from './settings-controls.module.css'

/** "Ștergi definitiv contul?": e-mail confirmation plus password, or a fresh provider sign-in. */
export function SettingsDeleteDialog({ account, mobile }: { account: AccountSettingsController; mobile: boolean }) {
  const t = useTranslations('settings')
  const { profile } = account
  const close = () => account.onDeleteOpenChange(false)
  return (
    <ReferenceOverlay open={account.deleteOpen} mobile={mobile} busy={account.blocked} wide alert onClose={close}>
      <form className={controls.dialogBody} onSubmit={account.deleteAccount} data-settings-delete-dialog="">
        <div className={controls.dialogClose}>
          <CloseButton onClick={close} />
        </div>
        <div className={ui.dialogHead}>
          <DeleteIllustration alt={t('page.deleteIllustration')} />
          <OverlayTitle mobile={mobile}>{t('deleteDialogTitle')}</OverlayTitle>
          <OverlayDescription mobile={mobile}>{t('page.deleteDescription')}</OverlayDescription>
        </div>
        <TextField
          label={t('deleteConfirmationLabel', { email: profile.email })}
          type="email"
          placeholder={profile.email}
          autoComplete="off"
          value={account.deleteConfirmation}
          disabled={account.blocked}
          onChange={(event) => account.setDeleteConfirmation(event.target.value)}
          data-settings-delete-email=""
        />
        {profile.canChangePassword ? (
          <TextField
            label={t('currentPassword')}
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={account.deletePassword}
            disabled={account.blocked}
            onChange={(event) => account.setDeletePassword(event.target.value)}
            data-settings-delete-password=""
          />
        ) : (
          !profile.recentlyAuthenticated && (
            <button
              type="button"
              className={`${ui.button} ${ui.secondary} ${ui.focus}`}
              disabled={account.blocked}
              aria-busy={account.busy === 'reauthenticate' || undefined}
              onClick={account.reauthenticate}
              data-settings-reauthenticate=""
            >
              {profile.provider === 'google' && <SettingsGoogleIcon />}
              {t('reauthenticate')}
            </button>
          )
        )}
        <FieldError message={account.errors.delete || account.errors.reauthenticate} />
        <div className={ui.actions}>
          <button type="button" className={`${ui.button} ${ui.secondary} ${ui.focus}`} disabled={account.blocked} onClick={close}>
            {t('cancel')}
          </button>
          <button
            type="submit"
            className={`${ui.button} ${ui.danger} ${ui.focus}`}
            disabled={account.blocked || !account.deletionValid}
            aria-busy={account.busy === 'delete' || undefined}
            data-settings-delete-submit=""
          >
            <Trash2 aria-hidden="true" />
            {t('deletePermanently')}
          </button>
        </div>
      </form>
    </ReferenceOverlay>
  )
}
