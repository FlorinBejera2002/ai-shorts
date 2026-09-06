'use client'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useLocale } from 'next-intl'
export function ApiState({
  error,
  retry
}: { error?: string | null; retry?: () => void }) {
  const ro = useLocale() === 'ro'
  return (
    <div
      className="flex min-h-64 flex-col items-center justify-center gap-4 p-8"
      role={error ? 'alert' : 'status'}
    >
      {error ? (
        <>
          <p>
            {ro
              ? 'Datele nu au putut fi încărcate.'
              : 'Unable to load this page.'}
          </p>
          {retry && (
            <Button onClick={retry} variant="outline">
              {ro ? 'Încearcă din nou' : 'Try again'}
            </Button>
          )}
        </>
      ) : (
        <>
          <Loader2
            className="size-6 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            {ro ? 'Se încarcă…' : 'Loading…'}
          </p>
        </>
      )}
    </div>
  )
}
