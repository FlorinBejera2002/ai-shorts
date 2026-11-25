import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('en', 'alternatives/klap')

export default function Page() {
  return <FeaturePage locale="en" id="alternatives/klap" />
}
