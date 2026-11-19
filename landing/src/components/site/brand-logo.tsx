type BrandLogoProps = { height: number; alt?: string }

/** Wordmark that follows the active theme (dark text in light mode, white text in dark mode). */
export function BrandLogo({ height, alt = 'Sneep Cut' }: BrandLogoProps) {
  const width = Math.round((height * 1652) / 396)
  return (
    <>
      <img className="theme-logo-light" src="/landing/brand/logo.svg" alt={alt} width={width} height={height} style={{ height, width: 'auto' }} />
      <img className="theme-logo-dark" src="/landing/brand/logo-dark.svg" alt={alt} width={width} height={height} style={{ height, width: 'auto' }} />
    </>
  )
}
