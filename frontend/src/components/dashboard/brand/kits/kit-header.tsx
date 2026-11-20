'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSwipeBack } from '@/hooks/use-swipe-back'
import { Link, useRouter } from '@/i18n/navigation'
import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { BrandKitMeta } from '../use-brand-kit'
import { KitMenu } from './kit-menu'
import { kitHref, orderKits, type BrandKitSummary } from './kit-model'
import { KitAvatar } from './kit-visuals'
import styles from './kits.module.css'
import { useBrandKits } from './use-brand-kits'
import { useKitCommands } from './use-kit-commands'

/** Editor header: back to Kiturile mele, the kit being edited, and its menu. */
export function KitHeader({ meta }: { meta: BrandKitMeta | null }) {
  const t = useTranslations('brandKits')
  const mobile = useIsMobile()
  const router = useRouter()
  const { kits, actions } = useBrandKits()
  const ordered = kits ? orderKits(kits) : []
  // The list stays current after rename/image/default; the editor's own read covers first paint.
  const listed = ordered.find((item) => item.id === meta?.id)
  const kit: Pick<BrandKitSummary, 'name' | 'imageUrl' | 'isDefault'> | null = listed ?? meta
  const commands = useKitCommands({
    kits: ordered,
    actions,
    mobile,
    onOpen: (id) => router.push(kitHref(id)),
    onDeleted: () => router.push('/dashboard/brand')
  })
  useSwipeBack(() => router.push('/dashboard/brand'), mobile)
  return (
    <div className={styles.kitHeader} data-kit-header="">
      <Link href="/dashboard/brand" className={`${ui.button} ${ui.secondary} ${ui.focus} ${styles.kitBack}`}>
        <ChevronLeft aria-hidden="true" />
        {t('allKits')}
      </Link>
      {!mobile && <span className={styles.kitDivider} aria-hidden="true" />}
      {kit && (
        <span className={styles.kitIdentity}>
          <KitAvatar kit={kit} size={mobile ? 28 : 34} />
          <b className={ui.heading}>{kit.name}</b>
          {kit.isDefault && !mobile && <span className={styles.badge}>{t('default')}</span>}
        </span>
      )}
      {listed && <KitMenu kit={listed} mobile={mobile} size={40} bordered onCommand={commands.run} />}
      {commands.overlays}
    </div>
  )
}
