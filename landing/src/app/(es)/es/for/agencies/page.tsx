import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('es', 'for/agencies')

export default function Page() {
  return <FeaturePage locale="es" id="for/agencies" />
}
