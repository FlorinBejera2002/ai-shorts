import type { ReactNode } from 'react'
import '../globals.css'
import { RootDocument } from '@/components/site/root-document'
import { siteViewport } from '@/lib/viewport'

export const viewport = siteViewport

export default function Layout({ children }: { children: ReactNode }) {
  return <RootDocument locale="ro">{children}</RootDocument>
}
