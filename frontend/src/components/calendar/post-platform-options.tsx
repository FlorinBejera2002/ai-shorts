'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PublishingPlatformIcon } from '@/components/publishing/publishing-platform-icon'
import type { ContentPlatform } from '@/lib/content-calendar'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Tabs } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import styles from './post-platform-options.module.css'
import theme from './publishing-theme.module.css'

const PLATFORM_NAMES: Record<ContentPlatform, string> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
  facebook: 'Facebook'
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
  const [selectedPlatform, setSelectedPlatform] = useState<ContentPlatform>('tiktok')
  const orderedPlatforms = (Object.keys(PLATFORM_NAMES) as ContentPlatform[])
    .filter(platform => platforms.includes(platform))
  const activePlatform = orderedPlatforms.includes(selectedPlatform)
    ? selectedPlatform
    : orderedPlatforms[0]

  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent
        className={`${theme.surface} ${styles.drawer}`}
        overlayClassName={theme.overlay}
        aria-describedby={undefined}
        data-publish-surface=""
        data-platform-options=""
      >
        <header className={styles.header}>
          <DialogTitle className={styles.title}>{t('platformOptions')}</DialogTitle>
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
                  data-provider={platform}
                  className={styles.tab}
                  disabled={disabled}
                  aria-label={PLATFORM_NAMES[platform]}
                  title={PLATFORM_NAMES[platform]}
                >
                  <PublishingPlatformIcon platform={platform} />
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
          >
            {t('done')}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
