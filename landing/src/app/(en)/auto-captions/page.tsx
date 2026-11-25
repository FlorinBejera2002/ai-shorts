import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('en', 'auto-captions')

export default function Page() {
  return <FeaturePage locale="en" id="auto-captions" />
}
