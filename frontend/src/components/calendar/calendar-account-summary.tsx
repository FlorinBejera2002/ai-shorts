'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose
} from '@/components/ui/dialog'
import {
  isPublishingAccountUsable,
  type PublishingData,
  type PublishingProvider
} from '@/lib/publishing'
import { AlertCircle, Check, ChevronDown, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CalendarConnections } from './calendar-connections'
import styles from './calendar-publishing.module.css'
import theme from './publishing-theme.module.css'

const providerOrder: PublishingProvider[] = [
  'tiktok',
  'youtube',
  'instagram',
  'facebook'
]

export function CalendarAccountSummary(props: {
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
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className={styles.connections} aria-label={t('connections.title')}>
        <div className={styles.accountList}>
          {providerOrder.map((provider) => {
            const accounts =
              props.data?.accounts.filter(
                (account) => account.provider === provider
              ) ?? []
            const connected = accounts.some(isPublishingAccountUsable)
            const reconnect = !connected && accounts.length > 0
            const status = t(
              `connections.${connected ? 'connected' : reconnect ? 'reconnect' : 'connect'}`
            )
            const label = `${t(`platforms.${provider}`)} – ${status}`
            return (
              <button
                key={provider}
                type="button"
                className={styles.account}
                data-connection={
                  connected
                    ? 'connected'
                    : reconnect
                      ? 'reconnect'
                      : 'disconnected'
                }
                onClick={() => setOpen(true)}
                aria-label={label}
                title={label}
              >
                <PlatformBrandIcon provider={provider} className="size-8" />
                <span
                  className={styles.connectionStatus}
                  data-connected={connected}
                  data-reconnect={reconnect}
                >
                  {connected ? (
                    <Check />
                  ) : reconnect ? (
                    <AlertCircle />
                  ) : (
                    <Plus />
                  )}
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className={styles.mobileAccounts}
          onClick={() => setOpen(true)}
          aria-label={t('connections.title')}
        >
          <span className={styles.mobileAccountIcons}>
            {providerOrder.slice(0, 3).map((provider) => (
              <PlatformBrandIcon
                key={provider}
                provider={provider}
                className="size-6"
              />
            ))}
          </span>
          <ChevronDown className="size-3.5" />
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={`${theme.surface} ${styles.accountsDialog}`}
          overlayClassName={theme.overlay}
          data-publish-surface=""
          aria-describedby={undefined}
        >
          <span className={styles.sheetHandle} aria-hidden="true" />
          <DialogHeader className="pr-8">
            <DialogTitle>{t('connections.title')}</DialogTitle>
          </DialogHeader>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className={styles.dialogClose}
              aria-label={t('actions.close')}
            >
              <X />
            </Button>
          </DialogClose>
          <CalendarConnections {...props} />
        </DialogContent>
      </Dialog>
    </>
  )
}
