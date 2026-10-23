'use client'

import { Button } from '@/components/ui/button'
import { SignOutAction } from '@/components/shared/sign-out-action'
import { Link } from '@/i18n/navigation'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  Mail,
  Shield
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { SettingsIdentity } from './settings-identity'
import type { Profile, SettingsSection } from './settings-types'
import styles from './settings-workspace.module.css'

export function SettingsAccountPanel({
  profile,
  disabled,
  onSectionChange
}: {
  profile: Profile
  disabled: boolean
  onSectionChange: (section: SettingsSection) => void
}) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const provider = profile.canChangePassword
    ? t('workspaceDesign.password')
    : profile.provider === 'google'
      ? 'Google'
      : profile.provider
  return (
    <section className={styles.panel} aria-labelledby="account-title">
      <h2 id="account-title" className={styles.heading}>
        {t('workspaceDesign.account')}
      </h2>
      <SettingsIdentity profile={profile} />
      <dl className={styles.details}>
        <div>
          <dt>
            <LockKeyhole />
            {t('workspaceDesign.signInMethod')}
          </dt>
          <dd>{provider}</dd>
        </div>
        <div>
          <dt>
            <Mail />
            {t('emailStatus')}
          </dt>
          <dd>
            {profile.emailVerified && (
              <CheckCircle2 className={styles.verified} />
            )}
            {t(profile.emailVerified ? 'verified' : 'notVerified')}
          </dd>
        </div>
        <div>
          <dt>
            <CalendarDays />
            {t('memberSince')}
          </dt>
          <dd>
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
              new Date(profile.createdAt)
            )}
          </dd>
        </div>
      </dl>
      <div className={styles.accountActions}>
        <Button disabled={disabled} onClick={() => onSectionChange('profile')}>
          {t('workspaceDesign.editProfile')}
          <ArrowRight />
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/billing">
            {t('manageSubscription')}
            <ArrowRight />
          </Link>
        </Button>
        <SignOutAction disabled={disabled} className={styles.signOut} />
      </div>
      <button
        type="button"
        className={styles.privacyShortcut}
        onClick={() => onSectionChange('privacy')}
      >
        <Shield aria-hidden="true" />
        <span>
          <strong>{t('workspaceDesign.privacy')}</strong>
          <small>{t('workspaceDesign.privacyHint')}</small>
        </span>
        <ChevronRight aria-hidden="true" />
      </button>
    </section>
  )
}
