import { pricingMetadata } from '@/lib/page-metadata'
import { PricingPage } from '@/views/pricing-page'

export const metadata = pricingMetadata('es')

export default function Page() {
  return <PricingPage locale="es" />
}
