import { useEffect } from 'react'
import { useLocation, useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { reportClientError } from '@/lib/error-reporting'

export function RouteError() {
  const { pathname } = useLocation()
  const error = useRouteError()
  useEffect(() => { reportClientError(error) }, [error])
  const romanian = pathname === '/ro' || pathname.startsWith('/ro/')
  return (
    <main role="alert" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">
        {romanian ? 'Pagina nu a putut fi încărcată' : 'The page could not be loaded'}
      </h1>
      <p className="text-muted-foreground">
        {romanian ? 'Reîncarcă pagina pentru a încerca din nou.' : 'Reload the page to try again.'}
      </p>
      <Button className="self-start" onClick={() => window.location.reload()}>
        {romanian ? 'Reîncarcă pagina' : 'Reload page'}
      </Button>
    </main>
  )
}
