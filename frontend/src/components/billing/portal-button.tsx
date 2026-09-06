'use client'

import { apiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'

import { ExternalLink, Loader2 } from 'lucide-react'
import { useId, useState } from 'react'

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
  const errorId = useId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openPortal() {
    if (disabled || loading) return

    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale })
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
        throw new Error('Billing portal could not be opened')
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
        onClick={() => void openPortal()}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-describedby={error ? errorId : undefined}
        className={`${className} min-h-11 disabled:cursor-not-allowed disabled:opacity-65`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
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
