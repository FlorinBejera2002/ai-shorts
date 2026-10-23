'use client'

import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LogoSection } from './logo-section'
import { WatermarkSection } from './watermark-section'
import type {
  BrandKitController,
  BrandWorkspaceSection
} from './brand-workspace-types'
import styles from './brand-page.module.css'

export function BrandLogoGroup({
  brand,
  section,
  fontBusy,
  onSectionChange
}: {
  brand: BrandKitController
  section: BrandWorkspaceSection
  fontBusy: boolean
  onSectionChange: (section: BrandWorkspaceSection) => void
}) {
  const t = useTranslations('brand')
  const visible = section === 'overview' || section === 'logo'
  return (
    <section className={styles.logoGroup} data-visible={visible}>
      <h2>
        <button
          type="button"
          className={styles.sectionTrigger}
          data-brand-section-trigger="logo"
          aria-expanded={section === 'logo'}
          onClick={() =>
            onSectionChange(section === 'logo' ? 'overview' : 'logo')
          }
        >
          <span>{t('logoWatermark')}</span>
          <ChevronRight aria-hidden="true" />
        </button>
      </h2>
      <div hidden={!visible} className={styles.logoBody}>
        <LogoSection
          logoUrl={brand.logoPreviewUrl}
          fileName={brand.logoName}
          busy={brand.saving || brand.logoBusy || fontBusy}
          onUpload={brand.uploadLogo}
          onRemove={brand.removeLogo}
        />
        <div hidden={section !== 'logo'}>
          <WatermarkSection
            kit={brand.kit}
            canWhiteLabel={brand.canWhiteLabel}
            update={brand.update}
          />
        </div>
        {section === 'overview' && (
          <button
            type="button"
            className={styles.logoSettings}
            onClick={() => onSectionChange('logo')}
          >
            <ChevronRight aria-hidden="true" />
            {t('workspaceDesign.logoSettings')}
          </button>
        )}
      </div>
    </section>
  )
}
