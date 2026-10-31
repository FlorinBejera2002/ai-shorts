'use client'

import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useIsMobile } from '@/hooks/use-mobile'
import { AlertCircle, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CaptionsSection } from './captions-section'
import { BrandLogoGroup } from './brand-logo-group'
import { BrandWorkspaceHeader } from './brand-workspace-header'
import type {
  BrandKitController,
  BrandWorkspaceSection
} from './brand-workspace-types'
import { PreviewPanel } from './preview-panel'
import type { PreviewRatio } from './types'
import { useBrandKit } from './use-brand-kit'
import styles from './brand-page.module.css'
import theme from '@/components/calendar/publishing-theme.module.css'

export default function BrandPage() {
  const t = useTranslations('brand')
  const brand = useBrandKit((key) => t(key as Parameters<typeof t>[0]))
  return (
    <div className={`${theme.surface} ${styles.workspace}`} data-reference-surface="">
      {brand.loading ? (
        <>
          <WorkspaceMobileHeader />
          <div className={styles.loading} aria-label={t('loading')}>
            <LoadingIndicator className="size-6" />
          </div>
        </>
      ) : brand.loadError ? (
        <>
          <WorkspaceMobileHeader />
          <div className={styles.error} role="alert">
            <AlertCircle className="size-7 text-destructive" />
            <h1>{t('loadErrorTitle')}</h1>
            <p>{t('loadErrorDesc')}</p>
            <Button onClick={() => void brand.retry()}>{t('retry')}</Button>
          </div>
        </>
      ) : (
        <BrandWorkspace brand={brand} />
      )}
    </div>
  )
}

function BrandWorkspace({ brand }: { brand: BrandKitController }) {
  const t = useTranslations('brand')
  const mobile = useIsMobile()
  const [section, setSection] = useState<BrandWorkspaceSection>('overview')
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const [ratio, setRatio] = useState<PreviewRatio>('9:16')
  const [fontBusy, setFontBusy] = useState(false)
  function goBack() {
    if (previewExpanded) setPreviewExpanded(false)
    else setSection('overview')
  }

  return (
    <div
      className={styles.content}
      data-brand-workspace=""
      data-section={section}
      data-preview-expanded={previewExpanded}
    >
      <WorkspaceMobileHeader />
      <BrandWorkspaceHeader
        brand={brand}
        section={section}
        expanded={previewExpanded}
        fontBusy={fontBusy}
        onBack={goBack}
      />
      <div className={styles.layout}>
        <fieldset
          disabled={brand.saving || brand.logoBusy}
          className={styles.controls}
          hidden={previewExpanded}
        >
          <BrandLogoGroup
            brand={brand}
            section={section}
            fontBusy={fontBusy}
            onSectionChange={setSection}
          />
          <div hidden={section === 'logo'} className={styles.captionControls}>
            <CaptionsSection
              kit={brand.kit}
              update={brand.update}
              section={section === 'logo' ? 'overview' : section}
              onSectionChange={setSection}
              onBusyChange={setFontBusy}
            />
          </div>
          {section === 'logo' && (
            <button
              type="button"
              className={styles.collapsedCaption}
              data-brand-section-trigger="styles"
              onClick={() => setSection('styles')}
            >
              <span>{t('subtitleStyle')}</span>
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </fieldset>
        <div className={styles.preview}>
          <PreviewPanel
            kit={brand.kit}
            logoUrl={brand.logoPreviewUrl}
            canWhiteLabel={brand.canWhiteLabel}
            update={brand.saving ? () => {} : brand.update}
            presentation={
              previewExpanded ? 'expanded' : mobile ? 'compact' : 'panel'
            }
            section={section}
            ratio={ratio}
            onRatioChange={setRatio}
            onExpand={() => setPreviewExpanded(true)}
          />
        </div>
      </div>
    </div>
  )
}
