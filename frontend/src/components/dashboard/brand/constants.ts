import type { BrandKit, PreviewRatio } from './types'

export const BRAND_DEFAULTS: BrandKit = {
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

export const BRAND_FONTS = [
  'Inter',
  'Montserrat',
  'Roboto',
  'Poppins',
  'Open Sans',
  'Lato',
  'Oswald',
  'Playfair Display'
]

export const SUBTITLE_FONTS = [
  'Inter Bold',
  'Montserrat Bold',
  'Roboto Bold',
  'Poppins Bold',
  'Oswald',
  'Impact'
]

export const BRAND_PALETTES = [
  { name: 'Indigo', primary: '#6366F1', secondary: '#8B5CF6' },
  { name: 'Signal', primary: '#FF4F45', secondary: '#FFB000' },
  { name: 'Ocean', primary: '#087EA4', secondary: '#22D3A7' },
  { name: 'Cobalt', primary: '#155EEF', secondary: '#84ADFF' },
  { name: 'Berry', primary: '#C11574', secondary: '#F670C7' },
  { name: 'Midnight', primary: '#1D2939', secondary: '#6172F3' },
  { name: 'Gold', primary: '#B54708', secondary: '#FEC84B' },
  { name: 'Ember', primary: '#C4320A', secondary: '#FD853A' }
]

export const PREVIEW_RATIOS: Array<{
  value: PreviewRatio
  label: string
  aspect: string
}> = [
  { value: '9:16', label: 'Reels', aspect: 'aspect-[9/16]' },
  { value: '1:1', label: 'Feed', aspect: 'aspect-square' },
  { value: '16:9', label: 'Wide', aspect: 'aspect-video' }
]
