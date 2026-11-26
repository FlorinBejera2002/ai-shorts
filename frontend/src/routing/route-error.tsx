import { useEffect } from 'react'
import { useLocation, useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { pickInlineText } from '@/i18n/inline-text'
import { resolveSiteLocale } from '@/lib/site-config'
import { reportClientError } from '@/lib/error-reporting'

export function RouteError() {
  const { pathname } = useLocation()
  const error = useRouteError()
  useEffect(() => { reportClientError(error) }, [error])
  const locale = resolveSiteLocale(pathname.split('/')[1])
  return (
    <main role="alert" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">
        {pickInlineText(locale, 'The page could not be loaded', 'Pagina nu a putut fi încărcată', 'No se pudo cargar la página')}
      </h1>
      <p className="text-muted-foreground">
        {pickInlineText(locale, 'Reload the page to try again.', 'Reîncarcă pagina pentru a încerca din nou.', 'Recarga la página para volver a intentarlo.')}
      </p>
      <Button className="self-start" onClick={() => window.location.reload()}>
        {pickInlineText(locale, 'Reload page', 'Reîncarcă pagina', 'Recargar página')}
      </Button>
    </main>
  )
}
