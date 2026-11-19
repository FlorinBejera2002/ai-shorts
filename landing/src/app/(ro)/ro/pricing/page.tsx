import { pricingMetadata } from '@/lib/page-metadata'
import { PricingPage } from '@/views/pricing-page'

export const metadata = pricingMetadata('ro')

export default function Page() {
  return <PricingPage locale="ro" />
}
