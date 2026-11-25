import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('ro', 'auto-captions')

export default function Page() {
  return <FeaturePage locale="ro" id="auto-captions" />
}
