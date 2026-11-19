import { HomePage, homeMetadata } from '@/views/home-page'

export const metadata = homeMetadata('en')

export default function Page() {
  return <HomePage locale="en" />
}
