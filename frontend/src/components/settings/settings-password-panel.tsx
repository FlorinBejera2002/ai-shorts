'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from 'next-intl'
import type { AccountSettingsController } from './use-account-settings'
import { SettingsFeedback } from './settings-feedback'
import { SettingsGoogleIcon } from './settings-google-icon'
import styles from './settings-workspace.module.css'

export function SettingsPasswordPanel({
  account
}: {
  account: AccountSettingsController
}) {
  const t = useTranslations('settings')
  const provider =
    account.profile.provider === 'google' ? 'Google' : account.profile.provider
  return (
    <section
      className={styles.passwordSection}
      aria-labelledby="security-title"
    >
      <h2 id="security-title" className={styles.heading}>
        {t('securityTitle')}
      </h2>
      {account.profile.canChangePassword ? (
        <>
          <p className={styles.hint}>
            {t('workspaceDesign.passwordDescription')}
          </p>
          <form onSubmit={account.changePassword}>
            <fieldset
              disabled={account.blocked}
              className={styles.passwordFields}
            >
              <div className={styles.field}>
                <Label htmlFor="current-password">{t('currentPassword')}</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={account.currentPassword}
                  onChange={(event) =>
                    account.setCurrentPassword(event.target.value)
                  }
                  maxLength={128}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="new-password">{t('newPassword')}</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={account.newPassword}
                  onChange={(event) =>
                    account.setNewPassword(event.target.value)
                  }
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                  aria-describedby="password-policy"
                />
                <p id="password-policy" className={styles.hint}>
                  {t('passwordHint')}
                  <br />
                  {t('workspaceDesign.passwordByteLimit')}
                </p>
              </div>
              <div className={styles.field}>
                <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={account.confirmPassword}
                  onChange={(event) =>
                    account.setConfirmPassword(event.target.value)
                  }
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                />
              </div>
              <SettingsFeedback message={account.errors.password} />
              <Button
                type="submit"
                aria-busy={account.busy === 'password'}
                disabled={
                  !account.currentPassword ||
                  !account.newPassword ||
                  !account.confirmPassword
                }
              >
                {t('changePassword')}
              </Button>
            </fieldset>
          </form>
        </>
      ) : (
        <div className={styles.providerInfo}>
          <h3>{t('workspaceDesign.providerSignIn', { provider })}</h3>
          <div>
            {account.profile.provider === 'google' && <SettingsGoogleIcon />}
            <span>{t('providerAccount', { provider })}</span>
          </div>
          <p className={styles.hint}>{t('providerPassword', { provider })}</p>
        </div>
      )}
    </section>
  )
}
