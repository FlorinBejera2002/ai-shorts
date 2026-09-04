import { buildSitemapEntries } from '@/lib/site-config'
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries()
}
