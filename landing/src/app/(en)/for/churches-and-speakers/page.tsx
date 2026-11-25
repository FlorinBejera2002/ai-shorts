import { featureMetadata } from '@/lib/page-metadata'
import { FeaturePage } from '@/views/feature-page'

export const metadata = featureMetadata('en', 'for/churches-and-speakers')

export default function Page() {
  return <FeaturePage locale="en" id="for/churches-and-speakers" />
}
