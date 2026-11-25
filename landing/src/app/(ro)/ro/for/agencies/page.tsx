import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('ro', 'for/agencies')

export default function Page() {
  return <FeaturePage locale="ro" id="for/agencies" />
}
