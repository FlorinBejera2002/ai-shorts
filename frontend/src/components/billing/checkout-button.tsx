'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { apiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'

import { ArrowUpRight } from 'lucide-react'
import { useId, useState } from 'react'

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
  const errorId = useId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout() {
    if (disabled || loading) return

    setLoading(true)
    setError(null)

    try {
      const response = await apiFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ planId, locale })
      })
      const data: unknown = await response.json().catch(() => null)
      const destinationUrl =
        typeof data === 'object' &&
        data !== null &&
        'url' in data &&
        typeof data.url === 'string'
          ? data.url
          : null

      if (!response.ok || !destinationUrl) {
        throw new Error('Checkout session could not be created')
      }

      const destination = new URL(destinationUrl)
      if (destination.protocol !== 'https:') {
        throw new Error('Invalid billing destination')
      }
      window.location.assign(destination.toString())
    } catch {
      setError(errorLabel)
      setLoading(false)
    }
  }

  return (
    <div>
      <Button
        variant={emphasized ? 'default' : 'outline'}
        type="button"
        onClick={() => void startCheckout()}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-describedby={error ? errorId : undefined}
        className={`flex h-9 w-full items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-65 ${
          emphasized
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
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
