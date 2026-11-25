import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('en', 'youtube-to-shorts')

export default function Page() {
  return <FeaturePage locale="en" id="youtube-to-shorts" />
}
