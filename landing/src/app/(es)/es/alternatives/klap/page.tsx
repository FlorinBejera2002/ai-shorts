import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('es', 'alternatives/klap')

export default function Page() {
  return <FeaturePage locale="es" id="alternatives/klap" />
}
