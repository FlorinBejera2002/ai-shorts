import type { CaptionStyle } from './caption-style'

export type BrandKit = {
  captionStyle: CaptionStyle | null
  watermarkEnabled: boolean
  watermarkSize: number
  watermarkMargin: number
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  fontFamily: string
  applyBrandColors: boolean
  applyBrandFont: boolean
  subtitleFont: string
  subtitleColor: string
  subtitleBgColor: string
  subtitleBgOpacity: number
  subtitlePosition: string
  watermarkPosition: string
  watermarkOpacity: number
  hidePlatformBadge: boolean
}

export type BrandKitKey = keyof BrandKit
export type BrandKitUpdate = <K extends BrandKitKey>(
  key: K,
  value: BrandKit[K]
) => void

export type PreviewRatio = '9:16' | '1:1' | '16:9'
