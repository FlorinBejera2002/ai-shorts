import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('es', 'alternatives/vizard')

export default function Page() {
  return <FeaturePage locale="es" id="alternatives/vizard" />
}
