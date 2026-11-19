'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import ui from '@/components/shared/reference-ui.module.css'
import { useToast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import { authClient } from '@/lib/auth'
import { PUBLISHING_PROVIDER_CATALOG, type PublishingData } from '@/lib/publishing'
import { CreditCard, LogOut, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'
import { runExclusive } from './run-exclusive'
import { Avatar, Chevron } from './settings-ui'
import { SECTION_META, settingsHref, type Profile, type SettingsSection } from './settings-types'
import styles from './settings.module.css'

function MenuRow({ href, icon: Icon, label, trail, id }: { href: string; icon: LucideIcon; label: string; trail?: ReactNode; id: string }) {
  return (
    <Link href={href} className={`${styles.menuRow} ${styles.focus}`} data-settings-menu={id}>
      <Icon aria-hidden="true" />
      <span className={styles.rowLabel}>{label}</span>
      {trail}
      <Chevron />
    </Link>
  )
}

function SectionRow({ section }: { section: SettingsSection }) {
  const t = useTranslations('settings')
  const { label, icon } = SECTION_META[section]
  return <MenuRow href={settingsHref(section)} icon={icon} label={t(label)} id={section} />
}

/** Logos of the connected networks, in the standard platform order. */
function ConnectedLogos({ data }: { data: PublishingData | null }) {
  const connected = PUBLISHING_PROVIDER_CATALOG.filter(({ id }) =>
    data?.accounts.some((account) => account.provider === id && account.status === 'connected')
  )
  if (!connected.length) return null
  return (
    <span className={styles.menuLogos} data-settings-connected-logos="">
      {connected.map(({ id }) => (
        <PlatformBrandIcon key={id} provider={id} className="rounded-full" />
      ))}
    </span>
  )
}

function SignOutButton() {
  const t = useTranslations('settings.page')
  const toast = useToast()
  const [pending, setPending] = useState(false)
  function signOut() {
    void runExclusive({
      claim: () => !pending,
      onStart: () => setPending(true),
      onError: () => toast.add('error', t('signOutFailed')),
      onFinish: () => setPending(false),
      action: () => authClient.logout()
    })
  }
  return (
    <button
      type="button"
      className={`${ui.button} ${ui.focus} ${styles.signOut}`}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={signOut}
      data-settings-sign-out=""
    >
      <LogOut aria-hidden="true" />
      {t('signOut')}
    </button>
  )
}

/** Phone "Setări" menu: profile, grouped sections, subscription and sign out. */
export function SettingsMobileMenu({ profile, connections }: { profile: Profile; connections: PublishingData | null }) {
  const t = useTranslations('settings')
  const name = profile.name || profile.email
  return (
    <>
      <Link href={settingsHref('account')} className={`${styles.menuProfile} ${styles.focus}`} data-settings-menu="account">
        <Avatar name={name} image={profile.image} size={56} />
        <span className={styles.stack}>
          <b className={styles.menuName}>{name}</b>
          <span className={`${styles.meta} ${styles.menuEmail}`}>{profile.email}</span>
        </span>
        <Chevron />
      </Link>
      <span className={styles.menuGroup}>{t('page.groupAccount')}</span>
      <div className={styles.menuCard}>
        <SectionRow section="security" />
        <MenuRow
          href={settingsHref('connections')}
          icon={SECTION_META.connections.icon}
          label={t('connections')}
          trail={<ConnectedLogos data={connections} />}
          id="connections"
        />
        <MenuRow href="/dashboard/billing" icon={CreditCard} label={t('page.subscription')} id="billing" />
      </div>
      <span className={styles.menuGroup}>{t('page.groupApp')}</span>
      <div className={styles.menuCard}>
        <SectionRow section="notifications" />
        <SectionRow section="preferences" />
      </div>
      <span className={styles.menuGroup}>{t('page.groupData')}</span>
      <div className={styles.menuCard}>
        <SectionRow section="privacy" />
      </div>
      <SignOutButton />
    </>
  )
}
