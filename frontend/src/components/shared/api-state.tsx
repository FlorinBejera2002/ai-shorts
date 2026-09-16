'use client'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useLocale } from 'next-intl'
export function ApiState({
  error,
  retry
}: { error?: string | null; retry?: () => void }) {
  const ro = useLocale() === 'ro'
  const loadingLabel = ro ? 'Se încarcă…' : 'Loading…'

  if (!error) {
    return (
      <div
        className="grid min-h-svh place-items-center"
        role="status"
        aria-label={loadingLabel}
        aria-busy="true"
      >
        <LoadingIndicator className="size-36" />
        <span className="sr-only">{loadingLabel}</span>
      </div>
    )
  }

  return (
    <div
      className="flex min-h-64 flex-col items-center justify-center gap-4 p-8"
      role="alert"
    >
      <p>
        {ro ? 'Datele nu au putut fi încărcate.' : 'Unable to load this page.'}
      </p>
      {retry && (
        <Button onClick={retry} variant="outline">
          {ro ? 'Încearcă din nou' : 'Try again'}
        </Button>
      )}
    </div>
  )
}
