import { notFoundMetadata } from '@/lib/page-metadata'
import { NotFoundPage } from '@/views/not-found-page'

/** Spanish 404; the web server returns it with status 404 for unknown /es/* paths. */
export const metadata = notFoundMetadata('es')

export default function Page() {
  return <NotFoundPage locale="es" />
}
