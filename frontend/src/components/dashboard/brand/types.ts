export type BrandKit = {
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  fontFamily: string
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
