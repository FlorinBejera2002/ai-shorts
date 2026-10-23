'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { AccountSettingsController } from './use-account-settings'
import { SettingsIdentity } from './settings-identity'
import { SettingsFeedback } from './settings-feedback'
import styles from './settings-workspace.module.css'

export function SettingsProfilePanel({
  account
}: {
  account: AccountSettingsController
}) {
  const t = useTranslations('settings')
  return (
    <section className={styles.panel} aria-labelledby="profile-title">
      <h2 id="profile-title" className={styles.heading}>
        {t('workspaceDesign.profile')}
      </h2>
      <SettingsIdentity profile={account.profile} />
      <form onSubmit={account.saveProfile}>
        <fieldset disabled={account.blocked} className={styles.profileFields}>
          <div className={styles.field}>
            <Label htmlFor="name">{t('displayName')}</Label>
            <div className={styles.nameInput}>
              <Input
                id="name"
                value={account.name}
                onChange={(event) => account.setName(event.target.value)}
                minLength={2}
                maxLength={80}
                required
                autoComplete="name"
                aria-describedby="name-count"
              />
              <span id="name-count">{account.name.length}/80</span>
            </div>
          </div>
          <div className={styles.field}>
            <Label htmlFor="profile-email">{t('emailAddress')}</Label>
            <div className={styles.emailInput}>
              <LockKeyhole aria-hidden="true" />
              <Input
                id="profile-email"
                type="email"
                value={account.profile.email}
                readOnly
                aria-describedby="email-hint"
              />
            </div>
            {!account.profile.emailVerified && (
              <div className={styles.verificationActions}>
                <span className={styles.badge}>
                  <Mail aria-hidden="true" />
                  {t('workspaceDesign.emailUnverified')}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={account.resendVerification}
                  aria-busy={account.busy === 'verification'}
                >
                  {t('resendVerification')}
                </Button>
              </div>
            )}
            <p id="email-hint" className={styles.hint}>
              {t('emailReadOnly')}
            </p>
            <SettingsFeedback message={account.errors.verification} />
            <SettingsFeedback
              message={
                account.verificationSent ? t('verificationSent') : undefined
              }
              success
            />
          </div>
          <div className={styles.saveRow}>
            <SettingsFeedback message={account.errors.profile} />
            <Button
              type="submit"
              disabled={
                !account.profileValid ||
                account.normalizedName === account.profile.name
              }
              aria-busy={account.busy === 'profile'}
              data-settings-profile-save=""
            >
              {t('saveProfile')}
              <ArrowRight />
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
