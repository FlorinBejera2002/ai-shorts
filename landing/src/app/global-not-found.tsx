import './globals.css'
import { RootDocument } from '@/components/site/root-document'
import { siteViewport } from '@/lib/viewport'
import { NotFoundPage, notFoundMetadata } from '@/views/not-found-page'

export const metadata = notFoundMetadata('en')
export const viewport = siteViewport

/** English 404 for unmatched URLs; the web server serves /ro/404 for unknown Romanian paths. */
export default function GlobalNotFound() {
  return (
    <RootDocument locale="en">
      <NotFoundPage locale="en" />
    </RootDocument>
  )
}
