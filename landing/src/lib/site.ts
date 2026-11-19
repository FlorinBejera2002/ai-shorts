import { LEGAL_OPERATOR } from '@/content/legal/legal-content'

export const SITE_NAME = 'Sneep Cut'
const DEFAULT_SITE_URL = 'https://sneepcut.com'

function parseOrigin(value: string | undefined): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return new URL(url.origin)
  } catch {
    return null
  }
}

/** Public origin used for canonical URLs, hreflang, sitemap and JSON-LD. */
export function siteUrl(): URL {
  return parseOrigin(process.env.SITE_URL) ?? new URL(DEFAULT_SITE_URL)
}

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString()
}

/** Only the real public https origin may be indexed; previews and local builds stay noindex. */
export function isIndexable(url = siteUrl()): boolean {
  return url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)
}

export function contactEmail(): string {
  const value = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim()
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : LEGAL_OPERATOR.privacyEmail
}
