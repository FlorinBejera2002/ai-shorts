import { HomePage, homeMetadata } from '@/views/home-page'

export const metadata = homeMetadata('ro')

export default function Page() {
  return <HomePage locale="ro" />
}
