import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('en', 'long-video-to-shorts')

export default function Page() {
  return <FeaturePage locale="en" id="long-video-to-shorts" />
}
