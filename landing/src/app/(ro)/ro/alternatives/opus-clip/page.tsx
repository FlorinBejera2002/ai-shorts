import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('ro', 'alternatives/opus-clip')

export default function Page() {
  return <FeaturePage locale="ro" id="alternatives/opus-clip" />
}
