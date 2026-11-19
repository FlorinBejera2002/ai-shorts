'use client'

import {
  BILLING_PLAN_IDS,
  PAID_BILLING_PLAN_IDS,
  canStartPlanCheckout,
  isPaidBillingPlanId,
  planUsageMultiple,
  type BillingLocale,
  type BillingPlanId
} from '@/lib/billing'
import type { PlanCatalog } from '@/types/api'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { formatBillingPrice } from './billing-format'
import { HostedBillingButton } from './hosted-billing-button'
import ui from './billing-ui.module.css'
import styles from './plan-selector.module.css'

type PlanSelectorProps = {
  currentPlan: BillingPlanId
  /** With a live subscription, plan changes are confirmed in the billing portal. */
  changesInPortal: boolean
  planCatalog: PlanCatalog | undefined
  locale: BillingLocale
  onCancel: () => void
}

type PlanCardProps = {
  plan: BillingPlanId
  price: string | null
  current: boolean
  checked: boolean
  disabled: boolean
  onSelect: (plan: BillingPlanId) => void
}

function PlanCard({ plan, price, current, checked, disabled, onSelect }: PlanCardProps) {
  const t = useTranslations('billing')
  const multiple = isPaidBillingPlanId(plan) ? planUsageMultiple(plan) : 0
  const tier =
    plan === 'free'
      ? t('canvas.trialUsage')
      : multiple > 1
        ? t('canvas.usageMultiple', { count: multiple })
        : t('canvas.standardUsage')
  return (
    <label
      className={styles.plan}
      data-billing-plan={plan}
      data-selected={checked}
      data-disabled={disabled && !current}
    >
      <input
        type="radio"
        name="billing-plan"
        value={plan}
        className={styles.input}
        aria-label={t(plan)}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(plan)}
      />
      <span className={styles.radio} aria-hidden="true" />
      <span className={styles.nameRow}>
        <b className={`${ui.heading} ${styles.name}`}>{t(plan)}</b>
        {current && (
          <span className={ui.badge} data-tone="neutral">
            {t('currentPlan')}
          </span>
        )}
      </span>
      <img className={styles.art} src={`/illustrations/plan-${plan}.webp`} alt="" width={168} height={168} />
      <span className={styles.pricing}>
        <b className={styles.price}>
          {plan === 'free' ? t('canvas.noCost') : price ? t('canvas.priceMonth', { price }) : t('unavailable')}
        </b>
        <span className={ui.muted}>{tier}</span>
      </span>
      <ul className={styles.features}>
        {(t.raw(`canvas.features.${plan}`) as string[]).map((feature) => (
          <li key={feature}>
            <Check aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </label>
  )
}

function defaultSelection(currentPlan: BillingPlanId, eligible: (plan: BillingPlanId) => boolean) {
  return PAID_BILLING_PLAN_IDS.find((plan) => canStartPlanCheckout(currentPlan, plan) && eligible(plan)) ?? null
}

/** "Schimbă planul": choose a plan, then continue in Stripe Checkout or the billing portal. */
export function PlanSelector({ currentPlan, changesInPortal, planCatalog, locale, onCancel }: PlanSelectorProps) {
  const t = useTranslations('billing')
  const eligible = (plan: BillingPlanId) =>
    plan !== currentPlan &&
    (changesInPortal || (isPaidBillingPlanId(plan) && canStartPlanCheckout(currentPlan, plan))) &&
    (plan === 'free' || Boolean(planCatalog?.[plan]))
  const [choice, setChoice] = useState<BillingPlanId | null>(null)
  const selected = choice !== null && eligible(choice) ? choice : defaultSelection(currentPlan, eligible)
  const continueLabel = t('sectionDesign.continueInBilling')
  return (
    <div className={styles.selector} data-billing-plans="">
      <fieldset className={styles.fieldset}>
        <legend className={ui.muted}>{t('sectionDesign.monthlyBilling')}</legend>
        <div className={styles.grid}>
          {BILLING_PLAN_IDS.map((plan) => {
            const price = isPaidBillingPlanId(plan) ? planCatalog?.[plan] : undefined
            return (
              <PlanCard
                key={plan}
                plan={plan}
                price={price ? formatBillingPrice(price, locale) : null}
                current={plan === currentPlan}
                checked={selected === plan}
                disabled={!eligible(plan)}
                onSelect={setChoice}
              />
            )
          })}
        </div>
      </fieldset>
      <div className={styles.footer} data-billing-continue="">
        <span className={`${ui.muted} ${styles.note}`}>
          {t(changesInPortal ? 'sectionDesign.portalConfirmation' : 'sectionDesign.checkoutConfirmation')}
        </span>
        <button type="button" className={`${ui.button} ${ui.secondary} ${styles.cancel}`} onClick={onCancel}>
          {t('sectionDesign.cancel')}
        </button>
        <HostedBillingButton
          key={selected ?? 'none'}
          locale={locale}
          planId={!changesInPortal && isPaidBillingPlanId(selected) ? selected : undefined}
          label={continueLabel}
          loadingLabel={t(changesInPortal ? 'openingPortal' : 'openingCheckout')}
          errorLabel={t(changesInPortal ? 'portalError' : 'checkoutError')}
          variant="primary"
          iconPosition="end"
          disabled={selected === null}
          className={styles.continue}
        />
      </div>
    </div>
  )
}
