import { PricingPage, pricingMetadata } from '@/views/pricing-page'

export const metadata = pricingMetadata('ro')

export default function Page() {
  return <PricingPage locale="ro" />
}
