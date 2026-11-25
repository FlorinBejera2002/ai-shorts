import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('ro', 'ai-video-clipper')

export default function Page() {
  return <FeaturePage locale="ro" id="ai-video-clipper" />
}
