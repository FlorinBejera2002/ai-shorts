'use client'

import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { referenceSurface } from '@/components/shared/reference-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { useIsMobile } from '@/hooks/use-mobile'
import { Link, useRouter } from '@/i18n/navigation'
import { Plus, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useBrandPreviewMedia } from '../use-brand-preview-media'
import { KitMenu, type KitCommand } from './kit-menu'
import { captionFontName, kitHref, orderKits, type BrandKitSummary } from './kit-model'
import { KitAvatar, KitThumb } from './kit-visuals'
import styles from './kits.module.css'
import { useBrandKits } from './use-brand-kits'
import { useKitCommands } from './use-kit-commands'

/** Kiturile mele: every kit as a card that opens its editor, plus "Kit nou". */
export default function BrandKitsPage() {
  const t = useTranslations('brandKits')
  const mobile = useIsMobile()
  const router = useRouter()
  const { kits, isPending, isError, reload, actions } = useBrandKits()
  const poster = useBrandPreviewMedia().media?.poster ?? null
  const ordered = kits ? orderKits(kits) : []
  const commands = useKitCommands({ kits: ordered, actions, mobile, onOpen: (id) => router.push(kitHref(id)) })

  let body
  if (isError)
    body = (
      <section className={styles.state} role="alert" data-kits-state="error">
        <img src="/illustrations/brand-error.webp" alt={t('errorIllustration')} width={220} height={220} />
        <h2 className={ui.heading}>{t('loadError')}</h2>
        <button type="button" className={`${ui.button} ${ui.primary} ${ui.focus}`} onClick={reload}>
          <RotateCcw aria-hidden="true" />
          {t('retry')}
        </button>
      </section>
    )
  else if (isPending)
    body = (
      <div className={styles.grid} role="status" aria-label={t('loading')} data-kits-state="loading">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={styles.skeleton} style={{ height: mobile ? 254 : 360 }} />
        ))}
      </div>
    )
  else if (!ordered.length)
    body = (
      <div className={styles.grid} data-kits-state="empty">
        {!mobile && <NewTile label={t('newKit')} onClick={commands.openNew} />}
        <section className={styles.empty}>
          <img src="/illustrations/brand-kits.webp" alt={t('emptyIllustration')} width={mobile ? 240 : 240} height={240} />
          <h2 className={ui.heading}>{t('empty')}</h2>
          {mobile && (
            <button type="button" className={`${ui.button} ${ui.primary} ${ui.focus} ${styles.emptyAction}`} onClick={commands.openNew}>
              <Plus aria-hidden="true" strokeWidth={2.5} />
              {t('newKit')}
            </button>
          )}
        </section>
      </div>
    )
  else
    body = (
      <div className={styles.grid} data-kits-grid="">
        {ordered.map((kit) => (
          <KitCard key={kit.id} kit={kit} poster={poster} mobile={mobile} onCommand={commands.run} />
        ))}
        <NewTile label={t('newKit')} onClick={commands.openNew} />
      </div>
    )

  return (
    <div className={`${referenceSurface} ${styles.page}`} data-reference-surface="" data-brand-kits="">
      <WorkspaceMobileHeader />
      {!mobile && (
        <div className={styles.head}>
          <h1 className={ui.heading}>{t('title')}</h1>
          {ordered.length > 0 && <span className={styles.muted}>{t('count', { count: ordered.length })}</span>}
        </div>
      )}
      {body}
      {commands.overlays}
    </div>
  )
}

function NewTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={`${styles.newTile} ${ui.focus}`} onClick={onClick} data-kit-new="">
      <span aria-hidden="true">
        <Plus strokeWidth={2.5} />
      </span>
      {label}
    </button>
  )
}

function KitCard({
  kit,
  poster,
  mobile,
  onCommand
}: {
  kit: BrandKitSummary
  poster: string | null
  mobile: boolean
  onCommand: (command: KitCommand, kit: BrandKitSummary) => void
}) {
  const t = useTranslations('brandKits')
  const font = captionFontName(kit.captionStyle?.font_id) ?? kit.fontFamily
  return (
    <article
      className={styles.card}
      aria-label={kit.isDefault ? t('cardActive', { name: kit.name }) : t('card', { name: kit.name })}
      data-default={kit.isDefault ? '' : undefined}
      data-kit-card={kit.id}
    >
      <Link href={kitHref(kit.id)} className={styles.open} aria-label={t('open', { name: kit.name })} />
      <KitThumb kit={kit} poster={poster} height={mobile ? 200 : 300} width={mobile ? 165 : 250} />
      <div className={styles.cardRow}>
        {!mobile && <KitAvatar kit={kit} size={34} />}
        <span className={styles.cardCopy}>
          <span className={styles.cardName}>
            <b>{kit.name}</b>
            {kit.isDefault && <span className={styles.badge}>{t('default')}</span>}
          </span>
          <span className={styles.muted}>{mobile ? font : `${font} · ${kit.logoUrl ? t('logo') : t('noLogo')}`}</span>
        </span>
        <span className={styles.cardMenu}>
          <KitMenu kit={kit} mobile={mobile} onCommand={onCommand} />
        </span>
      </div>
    </article>
  )
}
