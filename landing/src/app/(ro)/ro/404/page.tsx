import { notFoundMetadata } from '@/lib/page-metadata'
import { NotFoundPage } from '@/views/not-found-page'

/** Romanian 404; the web server returns it with status 404 for unknown /ro/* paths. */
export const metadata = notFoundMetadata('ro')

export default function Page() {
  return <NotFoundPage locale="ro" />
}
