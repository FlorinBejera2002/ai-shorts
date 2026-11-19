'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import { isBillingPlanId, subscriptionPeriodKind } from '@/lib/billing'
import type { BillingData } from '@/types/api'
import { CreditCard } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Avatar, FieldError, IconCircle, LockedField, SettingsCard, StatusDot, TextField } from './settings-ui'
import type { AccountSettingsController } from './use-account-settings'
import styles from './settings.module.css'
import controls from './settings-controls.module.css'

type Props = { account: AccountSettingsController; mobile: boolean }

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function ProfileCard({ account, mobile }: Props) {
  const t = useTranslations('settings')
  const { profile } = account
  const unchanged = account.normalizedName === profile.name
  return (
    <SettingsCard title={t('workspaceDesign.profile')} data-settings-card="profile">
      <form className={styles.form} onSubmit={account.saveProfile}>
        <Avatar name={profile.name || profile.email} image={profile.image} size={mobile ? 84 : 72} />
        <div className={controls.fields}>
          <TextField
            label={t('displayName')}
            value={account.name}
            onChange={(event) => account.setName(event.target.value)}
            minLength={2}
            maxLength={80}
            required
            autoComplete="name"
            disabled={account.blocked}
            data-settings-name=""
          />
          <LockedField label={t('emailAddress')} value={profile.email} />
        </div>
        <FieldError message={account.errors.profile} />
        <div className={styles.actions}>
          {!mobile && (
            <button
              type="button"
              className={`${ui.button} ${ui.secondary} ${ui.focus}`}
              disabled={account.blocked || unchanged}
              onClick={account.resetProfile}
              data-settings-profile-cancel=""
            >
              {t('cancel')}
            </button>
          )}
          <button
            type="submit"
            className={`${ui.button} ${ui.primary} ${ui.focus}`}
            disabled={account.blocked || unchanged || !account.profileValid}
            aria-busy={account.busy === 'profile' || undefined}
            data-settings-profile-save=""
          >
            {t('saveProfile')}
          </button>
        </div>
      </form>
    </SettingsCard>
  )
}

function DetailsCard({ account, mobile }: Props) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const { profile } = account
  const method = profile.canChangePassword ? t('credentialsProvider') : profile.provider === 'google' ? t('page.google') : profile.provider
  return (
    <SettingsCard title={t('accountDetails')} data-settings-card="details">
      <dl className={styles.details}>
        <div>
          <dt>{t('memberSince')}</dt>
          <dd>{formatDate(profile.createdAt, locale)}</dd>
        </div>
        <div>
          <dt>{t('emailStatus')}</dt>
          <dd>
            {profile.emailVerified ? (
              <StatusDot tone="ok">{t('verified')}</StatusDot>
            ) : (
              <span className={styles.unverified}>
                <StatusDot tone="muted">{t('notVerified')}</StatusDot>
                <button
                  type="button"
                  className={`${ui.button} ${ui.ghost} ${ui.focus} ${styles.small}`}
                  disabled={account.blocked}
                  aria-busy={account.busy === 'verification' || undefined}
                  onClick={account.resendVerification}
                  data-settings-resend=""
                >
                  {t('resendVerification')}
                </button>
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>{mobile ? t('page.signIn') : t('workspaceDesign.signInMethod')}</dt>
          <dd>{method}</dd>
        </div>
      </dl>
      <FieldError message={account.errors.verification} />
      {account.verificationSent && (
        <p className={styles.meta} role="status">
          {t('verificationSent')}
        </p>
      )}
    </SettingsCard>
  )
}

function SubscriptionCard() {
  const t = useTranslations('settings')
  const billing = useTranslations('billing')
  const locale = useLocale()
  const { data } = useApiResource<BillingData>('/api/stripe/billing')
  const plan = data?.account.creditsUnlimited
    ? billing('adminPlan')
    : data && isBillingPlanId(data.account.plan)
      ? billing(data.account.plan)
      : null
  const period = data ? subscriptionPeriodKind(data.subscription) : 'none'
  const end = data?.subscription?.currentPeriodEnd
  return (
    <SettingsCard title={t('page.subscription')} data-settings-card="subscription">
      {plan && (
        <div className={styles.row} data-settings-plan="">
          <IconCircle large>
            <CreditCard aria-hidden="true" />
          </IconCircle>
          <span className={styles.stack}>
            <b className={styles.strong}>{plan}</b>
            {end && (period === 'renews' || period === 'ends') && (
              <span className={styles.meta}>
                {t(period === 'renews' ? 'page.renewsOn' : 'page.endsOn', { date: formatDate(end, locale) })}
              </span>
            )}
          </span>
        </div>
      )}
      <Link href="/dashboard/billing" className={`${ui.button} ${ui.secondary} ${ui.focus} ${styles.subscriptionLink}`} data-settings-billing="">
        {t('manageSubscription')}
      </Link>
    </SettingsCard>
  )
}

/** "Cont": profile, account details and the subscription summary. */
export function SettingsAccountSection(props: Props) {
  return (
    <>
      <ProfileCard {...props} />
      <div className={styles.grid}>
        <DetailsCard {...props} />
        <SubscriptionCard />
      </div>
    </>
  )
}
