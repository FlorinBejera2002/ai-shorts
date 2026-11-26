import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('es', 'ai-video-clipper')

export default function Page() {
  return <FeaturePage locale="es" id="ai-video-clipper" />
}
