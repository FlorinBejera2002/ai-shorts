'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import {
  ReferenceOverlay,
  referenceSurface
} from '@/components/shared/reference-overlay'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  isPublishingAccountUsable,
  type PublishingAccount,
  type PublishingData,
  type PublishingProvider
} from '@/lib/publishing'
import { AlertCircle, Check, Plus } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useTranslations } from 'next-intl'
import { Fragment, useState } from 'react'
import { useAccountDisconnect } from './calendar-account-disconnect'
import { DisconnectConfirmation } from './calendar-disconnect-confirmation'
import { CalendarAccountPanel } from './calendar-account-panel'
import panelStyles from './calendar-account-panel.module.css'
import styles from './calendar-publishing.module.css'

// Platform order is fixed: Instagram, Facebook, TikTok, YouTube.
const providerOrder: PublishingProvider[] = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube'
]

/** Avatar row for every network; each opens its own connection panel. */
export function CalendarAccountAvatars({
  data,
  error,
  onReload,
  onConnect,
  busyProvider
}: {
  data: PublishingData | null
  error: string | null
  onReload: () => void
  onConnect: (
    provider: PublishingProvider,
    providerConsent?: boolean
  ) => Promise<void>
  busyProvider: PublishingProvider | null
}) {
  const t = useTranslations('contentCalendar')
  const mobile = useIsMobile()
  const [activeProvider, setActiveProvider] =
    useState<PublishingProvider | null>(null)
  const disconnect = useAccountDisconnect(onReload)

  function accountsFor(provider: PublishingProvider) {
    return (
      data?.accounts.filter((account) => account.provider === provider) ?? []
    )
  }

  function providerName(provider: PublishingProvider) {
    return (
      data?.providers.find((item) => item.id === provider)?.name ??
      t(`platforms.${provider}`)
    )
  }

  function renderPanel(provider: PublishingProvider) {
    const providerInfo = data?.providers.find((item) => item.id === provider)
    return (
      <CalendarAccountPanel
        provider={provider}
        providerName={providerName(provider)}
        accounts={accountsFor(provider)}
        mobile={mobile}
        busyProvider={busyProvider}
        unavailable={providerInfo?.configured === false || error !== null}
        needsConsent={provider === 'youtube'}
        onConnect={onConnect}
        onRequestDisconnect={(account: PublishingAccount) => {
          setActiveProvider(null)
          disconnect.request(account)
        }}
      />
    )
  }

  return (
    <>
      <div className={styles.connections} aria-label={t('connections.title')}>
        <div className={styles.accountList}>
          {providerOrder.map((provider) => {
            const accounts = accountsFor(provider)
            const connected = accounts.some(isPublishingAccountUsable)
            const reconnect = !connected && accounts.length > 0
            const status = t(
              `connections.${connected ? 'connected' : reconnect ? 'reconnect' : 'connect'}`
            )
            const label = `${t(`platforms.${provider}`)} – ${status}`
            const avatar = (
              <button
                type="button"
                className={styles.account}
                data-connection={
                  connected
                    ? 'connected'
                    : reconnect
                      ? 'reconnect'
                      : 'disconnected'
                }
                onClick={() => setActiveProvider(provider)}
                aria-label={label}
                title={label}
              >
                <PlatformBrandIcon
                  provider={provider}
                  className={styles.avatarBrand}
                />
                <span
                  className={styles.connectionStatus}
                  data-connected={connected}
                  data-reconnect={reconnect}
                >
                  {connected ? <Check /> : reconnect ? <AlertCircle /> : <Plus />}
                </span>
              </button>
            )
            if (mobile) return <Fragment key={provider}>{avatar}</Fragment>
            return (
              <Popover.Root
                key={provider}
                open={activeProvider === provider}
                onOpenChange={(open) =>
                  setActiveProvider(open ? provider : null)
                }
              >
                <Popover.Trigger asChild>{avatar}</Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="start"
                    sideOffset={10}
                    collisionPadding={12}
                    data-publish-surface=""
                    aria-label={label}
                    className={`${referenceSurface} ${panelStyles.popover}`}
                  >
                    {renderPanel(provider)}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )
          })}
        </div>
      </div>
      {mobile && (
        <ReferenceOverlay
          open={activeProvider !== null}
          mobile
          onClose={() => setActiveProvider(null)}
        >
          {activeProvider && renderPanel(activeProvider)}
        </ReferenceOverlay>
      )}
      <DisconnectConfirmation
        account={disconnect.account}
        providerName={
          disconnect.account ? providerName(disconnect.account.provider) : ''
        }
        busy={disconnect.busy}
        mobile={mobile}
        onCancel={disconnect.cancel}
        onConfirm={() => void disconnect.confirm()}
      />
    </>
  )
}
