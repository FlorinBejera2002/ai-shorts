'use client'

import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SaveBar } from './save-bar'
import type {
  BrandKitController,
  BrandWorkspaceSection
} from './brand-workspace-types'
import styles from './brand-page.module.css'

export function BrandWorkspaceHeader({
  brand,
  section,
  expanded,
  fontBusy,
  onBack
}: {
  brand: BrandKitController
  section: BrandWorkspaceSection
  expanded: boolean
  fontBusy: boolean
  onBack: () => void
}) {
  const t = useTranslations('brand')
  const common = useTranslations('common')
  const titles = {
    overview: t('title'),
    logo: t('title'),
    styles: t('workspaceDesign.styles'),
    typography: t('workspaceDesign.typography'),
    colors: t('workspaceDesign.colors'),
    layout: t('workspaceDesign.layout')
  }
  const detail = expanded || (section !== 'overview' && section !== 'logo')
  const canGoBack = section !== 'overview' || expanded

  return (
    <header className={styles.header} data-detail={detail}>
      <div className={styles.titleGroup}>
        {canGoBack ? (
          <button
            type="button"
            className={styles.back}
            onClick={onBack}
            aria-label={t('workspaceDesign.back')}
            data-brand-back=""
          >
            <ArrowLeft aria-hidden="true" />
            <span>{t('workspaceDesign.back')}</span>
          </button>
        ) : (
          <Link
            href="/dashboard"
            className={styles.back}
            aria-label={common('back')}
          >
            <ArrowLeft aria-hidden="true" />
          </Link>
        )}
        <h1 className={styles.desktopTitle}>{t('title')}</h1>
        <h1 className={styles.mobileTitle}>
          {expanded ? t('preview') : titles[section]}
        </h1>
      </div>
      <Button
        variant="ghost"
        className={styles.mobileReset}
        disabled={brand.saving || brand.logoBusy || fontBusy}
        aria-label={common('reset')}
        onClick={brand.reset}
      >
        <RotateCcw className="size-4" />
        <span>{common('reset')}</span>
      </Button>
      <SaveBar
        dirty={brand.dirty}
        saving={brand.saving}
        saved={brand.saved}
        logoBusy={brand.logoBusy}
        fontBusy={fontBusy}
        hasInvalidColor={brand.hasInvalidColor}
        onDiscard={brand.discard}
        onReset={brand.reset}
        onSave={brand.save}
      />
    </header>
  )
}
