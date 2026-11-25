import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('en', 'for/agencies')

export default function Page() {
  return <FeaturePage locale="en" id="for/agencies" />
}
