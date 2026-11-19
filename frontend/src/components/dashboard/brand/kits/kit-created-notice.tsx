'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { Link } from '@/i18n/navigation'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useBrandKits } from './use-brand-kits'
import styles from './kits.module.css'

/** After "Salvează ca kit nou": the new kit's name, how many kits there are, and a way back to them. */
export function KitCreatedNotice({ name }: { name: string | undefined }) {
  const t = useTranslations('brandKits')
  const created = useSearchParams().get('created') === '1'
  const { kits } = useBrandKits()
  if (!created || !name) return null
  return (
    <div role="status" className={styles.created} data-kit-created="">
      <img src="/illustrations/brand-saved.webp" alt={t('savedIllustration')} width={72} height={72} />
      <span className={styles.createdCopy}>
        <b className={ui.heading}>{t('created', { name })}</b>
        {kits && <span className={styles.muted}>{t('count', { count: kits.length })}</span>}
      </span>
      <Link href="/dashboard/brand" className={`${ui.button} ${ui.secondary} ${ui.focus} ${styles.createdAction}`}>
        {t('seeKits')}
        <ChevronRight aria-hidden="true" />
      </Link>
    </div>
  )
}
