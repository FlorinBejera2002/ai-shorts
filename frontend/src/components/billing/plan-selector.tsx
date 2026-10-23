'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  BILLING_PLAN_IDS,
  type BillingLocale,
  type BillingPlanId,
  INITIAL_FREE_CREDITS,
  PLAN_CREDITS,
  canStartPlanCheckout,
  isPaidBillingPlanId
} from '@/lib/billing'
import type { BillingPlanPrice, PlanCatalog } from '@/types/api'
import { CheckoutButton } from './checkout-button'
import { PortalButton } from './portal-button'
import styles from './plan-selector.module.css'

type PlanSelectorProps = {
  currentPlan: BillingPlanId
  hasSubscription: boolean
  hasBillingProfile: boolean
  planCatalog: PlanCatalog | null | undefined
  locale: BillingLocale
  onCancel: () => void
}

type PlanRowProps = {
  plan: BillingPlanId
  locale: BillingLocale
  price: BillingPlanPrice | undefined
  isCurrent: boolean
  checked: boolean
  disabled: boolean
  onSelect: (plan: BillingPlanId) => void
}

function formatPrice(price: BillingPlanPrice, locale: BillingLocale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: price.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: price.amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(price.amount / 100)
}

function PlanRow({
  plan,
  locale,
  price,
  isCurrent,
  checked,
  disabled,
  onSelect
}: PlanRowProps) {
  const t = useTranslations('billing')
  const credits = plan === 'free' ? INITIAL_FREE_CREDITS : PLAN_CREDITS[plan]
  return (
    <label
      className={styles.plan}
      data-billing-plan={plan}
      data-selected={checked}
      data-disabled={disabled}
    >
      <div className={styles.description}>
        <div className={styles.name}>
          <span>{t(plan)}</span>
          {isCurrent && (
            <span className={styles.current}>{t('currentPlan')}</span>
          )}
        </div>
        <p>
          {t(plan === 'free' ? 'creditsOnSignup' : 'creditsMonthly', {
            credits: credits.toLocaleString(locale)
          })}
        </p>
        <p className={styles.features}>
          {t(`sectionDesign.planSummary.${plan}`)}
        </p>
      </div>
      <div className={styles.price}>
        {plan === 'free' ? (
          t('free')
        ) : price ? (
          <>
            {formatPrice(price, locale)}
            <span>{t('periodMonth')}</span>
          </>
        ) : (
          <span>{t('unavailable')}</span>
        )}
      </div>
      <input
        type="radio"
        name="billing-plan"
        value={plan}
        aria-label={t(plan)}
        disabled={disabled}
        checked={checked}
        onChange={() => onSelect(plan)}
      />
    </label>
  )
}

function SelectedPlanAction({
  canOpenPortal,
  selected,
  locale
}: {
  canOpenPortal: boolean
  selected: BillingPlanId | null
  locale: BillingLocale
}) {
  const t = useTranslations('billing')
  if (canOpenPortal)
    return (
      <PortalButton
        locale={locale}
        label={t('sectionDesign.continueInBilling')}
        loadingLabel={t('openingPortal')}
        errorLabel={t('portalError')}
        disabled={selected === null}
        emphasized
        className={styles.continue}
      />
    )
  if (isPaidBillingPlanId(selected))
    return (
      <CheckoutButton
        key={selected}
        planId={selected}
        locale={locale}
        label={t('sectionDesign.continueInBilling')}
        loadingLabel={t('openingCheckout')}
        errorLabel={t('checkoutError')}
        emphasized
      />
    )
  return (
    <Button type="button" className={styles.continue} disabled>
      {t('sectionDesign.continueInBilling')}
    </Button>
  )
}

export function PlanSelector({
  currentPlan,
  hasSubscription,
  hasBillingProfile,
  planCatalog,
  locale,
  onCancel
}: PlanSelectorProps) {
  const t = useTranslations('billing')
  const [selected, setSelected] = useState<BillingPlanId | null>(null)
  const canOpenPortal = hasSubscription && hasBillingProfile
  const eligible = (plan: BillingPlanId) =>
    plan !== currentPlan &&
    (canOpenPortal ||
      (isPaidBillingPlanId(plan) && canStartPlanCheckout(currentPlan, plan))) &&
    (plan === 'free' || Boolean(planCatalog?.[plan]))
  const validSelection =
    selected !== null && eligible(selected) ? selected : null
  return (
    <div className={styles.selector} data-billing-plans="">
      <fieldset className={styles.plans}>
        <legend>{t('sectionDesign.monthlyBilling')}</legend>
        {BILLING_PLAN_IDS.map((plan) => (
          <PlanRow
            key={plan}
            plan={plan}
            locale={locale}
            price={isPaidBillingPlanId(plan) ? planCatalog?.[plan] : undefined}
            isCurrent={plan === currentPlan}
            checked={validSelection === plan}
            disabled={!eligible(plan)}
            onSelect={setSelected}
          />
        ))}
      </fieldset>
      <div className={styles.footer} data-billing-continue="">
        <SelectedPlanAction
          canOpenPortal={canOpenPortal}
          selected={validSelection}
          locale={locale}
        />
        <p>
          {t(
            canOpenPortal
              ? 'sectionDesign.portalConfirmation'
              : 'sectionDesign.checkoutConfirmation'
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          className={styles.cancel}
          onClick={onCancel}
        >
          {t('sectionDesign.cancel')}
        </Button>
      </div>
    </div>
  )
}
