'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'

import { Button } from '@/components/ui/button'

import { ExternalLink } from 'lucide-react'
import { useHostedBillingAction } from './use-hosted-billing-action'

import type { BillingLocale } from '@/lib/billing'

type PortalButtonProps = {
  locale: BillingLocale
  label: string
  loadingLabel: string
  errorLabel: string
  className?: string
  emphasized?: boolean
  disabled?: boolean
}

export function PortalButton({
  locale,
  label,
  loadingLabel,
  errorLabel,
  className = '',
  emphasized = false,
  disabled = false
}: PortalButtonProps) {
  const { start, busy, loading, error, errorId } = useHostedBillingAction(
    'portal', { locale }, errorLabel
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
        className={`${className} disabled:cursor-not-allowed disabled:opacity-65`}
      >
        {loading ? (
          <LoadingIndicator className="h-4 w-4" />
        ) : (
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{loading ? loadingLabel : label}</span>
      </Button>
      {error && (
        <p
          id={errorId}
          className="mt-2 text-[11px] leading-relaxed text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
