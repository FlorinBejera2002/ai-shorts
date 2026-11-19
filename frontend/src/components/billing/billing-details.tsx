'use client'

import type { BillingLocale } from '@/lib/billing'
import { ChevronRight, CreditCard, Gauge, Info, LockKeyhole } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { HostedBillingButton } from './hosted-billing-button'
import ui from './billing-ui.module.css'
import styles from './billing-details.module.css'

const TOPICS = [
  { key: 'usage', Icon: Gauge, title: 'canvas.usageTitle', description: 'canvas.usageDescription' },
  { key: 'access', Icon: LockKeyhole, title: 'sectionDesign.accessTitle', description: 'canvas.accessDescription' },
  { key: 'changes', Icon: CreditCard, title: 'sectionDesign.changesTitle', description: 'canvas.changesDescription' }
] as const

/** Overview entry points: three topic rows on desktop, one "Detalii de facturare" card on phones. */
export function BillingDetailsLinks({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('billing')
  return (
    <>
      <section className={`${ui.card} ${styles.links}`} aria-labelledby="billing-details-title">
        <h2 id="billing-details-title" className={`${ui.heading} ${styles.title}`}>
          {t('sectionDesign.billingDetails')}
        </h2>
        <div className={styles.rows}>
          {TOPICS.map(({ key, Icon, title }) => (
            <button key={key} type="button" className={styles.row} onClick={onOpen} data-billing-details-topic={key}>
              <span className={ui.iconCircle}>
                <Icon aria-hidden="true" />
              </span>
              <span className={styles.rowLabel}>{t(title)}</span>
              <ChevronRight className={ui.muted} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
      <button type="button" className={`${ui.card} ${styles.mobileLink}`} onClick={onOpen} data-billing-details-mobile="">
        <span className={ui.iconCircle}>
          <Info aria-hidden="true" />
        </span>
        <b>{t('sectionDesign.billingDetails')}</b>
        <ChevronRight className={ui.muted} aria-hidden="true" />
      </button>
    </>
  )
}

/** "Detalii de facturare" view: how usage, paid access and changes work, plus the portal. */
export function BillingDetails({ locale, canManageBilling }: { locale: BillingLocale; canManageBilling: boolean }) {
  const t = useTranslations('billing')
  return (
    <div className={styles.details} data-billing-details="">
      <div className={styles.topics}>
        {TOPICS.map(({ key, Icon, title, description }) => (
          <section key={key} className={`${ui.card} ${styles.topic}`} data-billing-detail={key}>
            <span className={`${ui.iconCircle} ${styles.topicIcon}`}>
              <Icon aria-hidden="true" />
            </span>
            <span className={styles.topicCopy}>
              <b className={`${ui.heading} ${styles.topicTitle}`}>{t(title)}</b>
              <span className={ui.muted}>{t(description)}</span>
            </span>
          </section>
        ))}
      </div>
      {canManageBilling && (
        <HostedBillingButton
          locale={locale}
          label={t('manageBilling')}
          loadingLabel={t('openingPortal')}
          errorLabel={t('portalError')}
          className={styles.manage}
        />
      )}
    </div>
  )
}
