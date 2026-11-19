import { pricingMetadata } from '@/lib/page-metadata'
import { PricingPage } from '@/views/pricing-page'

export const metadata = pricingMetadata('en')

export default function Page() {
  return <PricingPage locale="en" />
}
