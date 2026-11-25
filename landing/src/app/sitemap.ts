import type { MetadataRoute } from 'next'
import { FEATURE_PAGE_IDS, featurePath } from '@/content/features'
import { LEGAL_DOCUMENT_IDS } from '@/content/legal/documents'
import { localePath, locales } from '@/lib/i18n'
import { languageAlternates } from '@/lib/metadata'
import { absoluteUrl } from '@/lib/site'

export const dynamic = 'force-static'

type SitemapPage = {
  path: string
  priority: number
  changeFrequency: 'weekly' | 'monthly' | 'yearly'
}

const PAGES: SitemapPage[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' },
  ...FEATURE_PAGE_IDS.map((id) => ({ path: featurePath(id), priority: 0.7, changeFrequency: 'monthly' as const })),
  ...LEGAL_DOCUMENT_IDS.map((id) => ({ path: `/${id}`, priority: 0.3, changeFrequency: 'yearly' as const }))
]

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((page) =>
    locales.map((locale) => ({
      url: absoluteUrl(localePath(locale, page.path)),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: { languages: languageAlternates(page.path) }
    }))
  )
}
