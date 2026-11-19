'use client'

import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { referenceSurface } from '@/components/shared/reference-overlay'
import { useTranslations } from 'next-intl'
import { useParams } from 'react-router-dom'
import { BrandEditor } from './brand-editor'
import { BrandEditorError, BrandEditorSkeleton } from './brand-editor-states'
import { useBrandKit } from './use-brand-kit'
import styles from './brand-editor.module.css'

/** `/dashboard/brand/:kitId` — `default` edits the account's default kit through the single-kit endpoint. */
export default function BrandPage() {
  const t = useTranslations('brand')
  const { kitId } = useParams()
  const brand = useBrandKit((key) => t(key as Parameters<typeof t>[0]), kitId && kitId !== 'default' ? kitId : null)
  return (
    <div className={`${referenceSurface} ${styles.tokens}`} data-reference-surface="">
      <WorkspaceMobileHeader />
      {brand.loading ? (
        <BrandEditorSkeleton />
      ) : brand.loadError ? (
        <BrandEditorError onRetry={() => void brand.retry()} />
      ) : (
        <BrandEditor brand={brand} />
      )}
    </div>
  )
}
