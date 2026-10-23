'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { Clock3, CreditCard, Database, Settings } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './billing-guide.module.css'

type LegacyGuideLabels = {
  title: string
  description: string
  predictableTitle: string
  predictableDescription: string
  rolloverTitle: string
  rolloverDescription: string
  controlTitle: string
  controlDescription: string
}

type BillingGuideProps = {
  labels?: LegacyGuideLabels
  expanded?: boolean
  onOpenDetails?: () => void
}

const ITEMS = [
  { key: 'credits', Icon: Database },
  { key: 'access', Icon: CreditCard },
  { key: 'changes', Icon: Clock3 }
] as const

function BillingTerms() {
  const t = useTranslations('billing.sectionDesign')
  return (
    <div className={styles.terms}>
      {ITEMS.map(({ key, Icon }) => (
        <article key={key}>
          <Icon aria-hidden="true" />
          <div>
            <h3>{t(`${key}Title`)}</h3>
            <p>{t(`${key}Description`)}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

export function BillingGuide({
  expanded = false,
  onOpenDetails
}: BillingGuideProps) {
  const t = useTranslations('billing.sectionDesign')
  return (
    <section
      className={styles.guide}
      data-billing-guide=""
      data-expanded={expanded}
      aria-label={t('billingDetails')}
    >
      <div hidden={!expanded}>
        <BillingTerms />
      </div>
      <div hidden={expanded}>
        <div className={onOpenDetails ? styles.desktop : undefined}>
          <Accordion type="single" collapsible>
            <AccordionItem value="details" className={styles.item}>
              <AccordionTrigger
                className={styles.trigger}
                data-billing-details-trigger=""
              >
                <span>
                  <Settings aria-hidden="true" />
                  {t('billingDetails')}
                </span>
              </AccordionTrigger>
              <AccordionContent className={styles.content}>
                <BillingTerms />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        {onOpenDetails && (
          <button
            type="button"
            className={styles.mobileTrigger}
            onClick={onOpenDetails}
            data-billing-details-trigger=""
          >
            <Settings aria-hidden="true" />
            <span>{t('billingDetails')}</span>
            <span aria-hidden="true">⌄</span>
          </button>
        )}
      </div>
    </section>
  )
}
