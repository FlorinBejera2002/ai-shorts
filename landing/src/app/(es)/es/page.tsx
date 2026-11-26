import { homeMetadata } from '@/lib/page-metadata'
import { HomePage } from '@/views/home-page'

export const metadata = homeMetadata('es')

export default function Page() {
  return <HomePage locale="es" />
}
