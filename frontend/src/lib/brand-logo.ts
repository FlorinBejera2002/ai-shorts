import { backendFetch } from '@/lib/api'
import { resolveMediaUrl } from '@/lib/signed-url'

type BrandLogoRecord = {
  logoPath: string | null
  logoUrl: string | null
}

/**
 * Brand kits retain only a durable storage key. Resolve that key through the
 * authenticated backend so local HMAC and private-object URLs are always fresh.
 */
export async function withFreshBrandLogo<T extends BrandLogoRecord>(
  brandKit: T | null
): Promise<T | null> {
  if (!brandKit) return null

  if (!brandKit.logoPath) {
    return {
      ...brandKit,
      logoUrl: resolveMediaUrl(null, brandKit.logoUrl)
    }
  }

  try {
    const response = await backendFetch(
      `/api/brand/logo?logo_path=${encodeURIComponent(brandKit.logoPath)}`
    )
    if (!response.ok) {
      return { ...brandKit, logoUrl: null }
    }

    const payload: unknown = await response.json()
    const logoUrl =
      payload &&
      typeof payload === 'object' &&
      'logo_url' in payload &&
      typeof payload.logo_url === 'string' &&
      payload.logo_url.length > 0
        ? payload.logo_url
        : null
    return { ...brandKit, logoUrl }
  } catch {
    return { ...brandKit, logoUrl: null }
  }
}
