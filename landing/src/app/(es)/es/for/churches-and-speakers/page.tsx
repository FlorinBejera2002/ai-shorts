import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('es', 'for/churches-and-speakers')

export default function Page() {
  return <FeaturePage locale="es" id="for/churches-and-speakers" />
}
