import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('es', 'alternatives/opus-clip')

export default function Page() {
  return <FeaturePage locale="es" id="alternatives/opus-clip" />
}
