import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('ro', 'schedule-social-posts')

export default function Page() {
  return <FeaturePage locale="ro" id="schedule-social-posts" />
}
