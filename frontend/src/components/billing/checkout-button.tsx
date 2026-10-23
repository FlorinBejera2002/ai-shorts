'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'

import { Button } from '@/components/ui/button'

import { ArrowUpRight } from 'lucide-react'
import { useHostedBillingAction } from './use-hosted-billing-action'

import type { BillingLocale, PaidBillingPlanId } from '@/lib/billing'

type CheckoutButtonProps = {
  planId: PaidBillingPlanId
  locale: BillingLocale
  label: string
  loadingLabel: string
  errorLabel: string
  disabled?: boolean
  emphasized?: boolean
}

export function CheckoutButton({
  planId,
  locale,
  label,
  loadingLabel,
  errorLabel,
  disabled = false,
  emphasized = false
}: CheckoutButtonProps) {
  const { start, busy, loading, error, errorId } = useHostedBillingAction(
    'checkout', { planId, locale }, errorLabel
  )

  return (
    <div>
      <Button
        variant={emphasized ? 'default' : 'outline'}
        type="button"
        onClick={() => void start(disabled)}
        disabled={disabled || busy}
        aria-busy={loading}
        aria-describedby={error ? errorId : undefined}
        className={`flex h-9 w-full items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-65 ${
          emphasized
            ? 'bg-foreground text-background hover:bg-foreground/90'
            : 'border border-border bg-card text-foreground hover:bg-muted'
        }`}
      >
        {loading ? (
          <LoadingIndicator className="h-4 w-4" />
        ) : !disabled ? (
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        ) : null}
        <span>{loading ? loadingLabel : label}</span>
      </Button>
      {error && (
        <p
          id={errorId}
          className="mt-2 text-center text-[11px] leading-relaxed text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
