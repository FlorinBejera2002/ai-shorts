'use client'

import { ThemeBrandLogo } from '@/components/shared/brand-logo'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { Menu } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './workspace-mobile-header.module.css'

export function WorkspaceMobileHeader() {
  const t = useTranslations('nav')
  const { openMobile, toggleSidebar } = useSidebar()

  return (
    <div className={styles.header} data-workspace-mobile-header="">
      <Button
        variant="outline"
        size="icon"
        onClick={toggleSidebar}
        aria-label={openMobile ? t('closeMenu') : t('openMenu')}
        aria-expanded={openMobile}
        aria-controls="dashboard-navigation"
        className="size-10 shrink-0 bg-muted/30 text-foreground hover:bg-muted"
      >
        <Menu className="size-6" />
      </Button>
      <ThemeBrandLogo size="md" />
    </div>
  )
}
