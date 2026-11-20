import type { BrandKit } from './types'

export const BRAND_DEFAULTS: BrandKit = {
  captionStyle: null,
  watermarkEnabled: true,
  watermarkSize: 0.18,
  watermarkMargin: 0.025,
  watermarkX: null,
  watermarkY: null,
  logoUrl: null,
  primaryColor: '#6366F1',
  secondaryColor: '#8B5CF6',
  fontFamily: 'Inter',
  applyBrandColors: false,
  applyBrandFont: false,
  subtitleFont: 'Inter Bold',
  subtitleColor: '#FFFFFF',
  subtitleBgColor: '#000000',
  subtitleBgOpacity: 0.7,
  subtitlePosition: 'bottom',
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.8,
  hidePlatformBadge: false
}

export const WHITE_LABEL_PLAN = 'agency'
export const LOGO_MAX_BYTES = 5 * 1024 * 1024
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp'
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const BRAND_SAVED_ILLUSTRATION = '/illustrations/brand-saved.webp'
