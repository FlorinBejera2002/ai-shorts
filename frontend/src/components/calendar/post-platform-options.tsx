'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import type { ContentPlatform } from '@/lib/content-calendar'
import { ArrowLeft, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Tabs } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import { CalendarMobileHeader } from './calendar-mobile-header'
import styles from './post-platform-options.module.css'

const PLATFORM_NAMES: Record<ContentPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube'
}

interface PostPlatformOptionsProps {
  platforms: ContentPlatform[]
  accountNames: Partial<Record<ContentPlatform, string>>
  children: Partial<Record<ContentPlatform, ReactNode>>
  onCancel: () => void
  onDone: () => void
  disabled: boolean
}

export function PostPlatformOptions({
  platforms,
  accountNames,
  children,
  onCancel,
  onDone,
  disabled
}: PostPlatformOptionsProps) {
  const t = useTranslations('contentCalendar.composer')
  const [selectedPlatform, setSelectedPlatform] = useState<ContentPlatform>('instagram')
  const orderedPlatforms = (Object.keys(PLATFORM_NAMES) as ContentPlatform[])
    .filter(platform => platforms.includes(platform))
  const activePlatform = orderedPlatforms.includes(selectedPlatform)
    ? selectedPlatform
    : orderedPlatforms[0]

  return (
    <Sheet open onOpenChange={open => { if (!open) onCancel() }}>
      <SheetContent
        className={styles.drawer}
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <div className={styles.mobileHeader}><CalendarMobileHeader /></div>
        <header className={styles.header}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.back}
            aria-label={t('cancel')}
            onClick={onCancel}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <SheetTitle className={styles.title}>{t('platformOptions')}</SheetTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.close}
            aria-label={t('cancel')}
            onClick={onCancel}
          >
            <X className="size-5" />
          </Button>
        </header>

        {activePlatform ? (
          <Tabs.Root
            value={activePlatform}
            onValueChange={value => setSelectedPlatform(value as ContentPlatform)}
            className={styles.tabs}
          >
            <Tabs.List className={styles.tabList} aria-label={t('platformOptions')}>
              {orderedPlatforms.map(platform => (
                <Tabs.Trigger
                  key={platform}
                  value={platform}
                  className={styles.tab}
                  disabled={disabled}
                >
                  <PlatformBrandIcon provider={platform} className="size-6" />
                  {PLATFORM_NAMES[platform]}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className={styles.scrollArea}>
              {orderedPlatforms.map(platform => (
                <Tabs.Content key={platform} value={platform} className={styles.panel}>
                  {accountNames[platform] && (
                    <p className={styles.account}>{accountNames[platform]}</p>
                  )}
                  <div className={styles.settings}>{children[platform]}</div>
                </Tabs.Content>
              ))}
            </div>
          </Tabs.Root>
        ) : (
          <p className={styles.empty}>{t('noPlatforms')}</p>
        )}

        <footer className={styles.footer}>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={onDone}
            disabled={disabled}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            {t('done')}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  )
}
