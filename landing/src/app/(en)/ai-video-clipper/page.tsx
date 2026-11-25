import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('en', 'ai-video-clipper')

export default function Page() {
  return <FeaturePage locale="en" id="ai-video-clipper" />
}
