'use client'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { pickInlineText } from '@/i18n/inline-text'
import { useLocale } from 'next-intl'
export function ApiState({
  error,
  retry
}: { error?: string | null; retry?: () => void }) {
  const locale = useLocale()
  const loadingLabel = pickInlineText(locale, 'Loading…', 'Se încarcă…', 'Cargando…')

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
        {pickInlineText(locale, 'Unable to load this page.', 'Datele nu au putut fi încărcate.', 'No se pudo cargar esta página.')}
      </p>
      {retry && (
        <Button onClick={retry} variant="outline">
          {pickInlineText(locale, 'Try again', 'Încearcă din nou', 'Inténtalo de nuevo')}
        </Button>
      )}
    </div>
  )
}
