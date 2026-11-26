import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('es', 'auto-captions')

export default function Page() {
  return <FeaturePage locale="es" id="auto-captions" />
}
