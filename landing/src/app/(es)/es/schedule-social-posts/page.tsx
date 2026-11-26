import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('es', 'schedule-social-posts')

export default function Page() {
  return <FeaturePage locale="es" id="schedule-social-posts" />
}
