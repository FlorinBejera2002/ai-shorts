import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('ro', 'youtube-to-shorts')

export default function Page() {
  return <FeaturePage locale="ro" id="youtube-to-shorts" />
}
