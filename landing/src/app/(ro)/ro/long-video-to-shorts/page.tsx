import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('ro', 'long-video-to-shorts')

export default function Page() {
  return <FeaturePage locale="ro" id="long-video-to-shorts" />
}
