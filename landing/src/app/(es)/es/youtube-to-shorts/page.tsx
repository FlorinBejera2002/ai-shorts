import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('es', 'youtube-to-shorts')

export default function Page() {
  return <FeaturePage locale="es" id="youtube-to-shorts" />
}
