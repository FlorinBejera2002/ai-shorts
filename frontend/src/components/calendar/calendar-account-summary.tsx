'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { isPublishingAccountUsable, type PublishingData, type PublishingProvider } from '@/lib/publishing'
import { ChevronRight, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CalendarConnections } from './calendar-connections'
import styles from './calendar-publishing.module.css'

export function CalendarAccountSummary(props: {
  data: PublishingData | null
  error: string | null
  onReload: () => void
  onConnect: (provider: PublishingProvider, providerConsent?: boolean) => Promise<void>
  busyProvider: PublishingProvider | null
}) {
  const t = useTranslations('contentCalendar')
  const [open, setOpen] = useState(false)
  const accounts = props.data?.accounts.filter(isPublishingAccountUsable) ?? []
  // Show one account per platform in the compact strip. Manage lists every account.
  const providers = [...new Set(accounts.map(account => account.provider))]

  return (
    <>
      <div className={styles.connections} aria-label={t('connections.title')}>
        <div className={styles.accountList}>
          {providers.map(provider => {
            const account = accounts.find(item => item.provider === provider)!
            return (
              <span key={provider} className={styles.account} title={account.username || account.name}>
                <PlatformBrandIcon provider={provider} className="size-8" />
                <span className="sr-only">{t(`platforms.${provider}`)}</span>
                <span className={styles.accountUsername}>
                  {account.username ? `@${account.username.replace(/^@/, '')}` : account.name}
                </span>
              </span>
            )
          })}
        </div>
        <span className={accounts.length ? styles.accountCount : 'text-sm text-muted-foreground'}>
          {props.error ? t('connections.loadError') : t('publishing.accounts', { count: accounts.length })}
        </span>
        <Button variant="ghost" onClick={() => setOpen(true)} className={styles.manage}>
          {t('publishing.manage')}<ChevronRight className="size-4" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-md p-5">
          <DialogHeader className="pr-8">
            <DialogTitle>{t('connections.title')}</DialogTitle>
            <DialogDescription>{t('publishing.manageDescription')}</DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute right-3 top-3" aria-label={t('actions.close')}>
              <X />
            </Button>
          </DialogClose>
          <CalendarConnections {...props} />
        </DialogContent>
      </Dialog>
    </>
  )
}
