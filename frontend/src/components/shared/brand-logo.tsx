import Image from 'next/image'

type BrandLogoProps = {
  compact?: boolean
  onDark?: boolean
  priority?: boolean
  variant?: 'default' | 'white-text'
  className?: string
}

export function ThemeBrandLogo({ priority = false }: { priority?: boolean }) {
  return (
    <>
      <span className="inline-flex dark:hidden">
        <BrandLogo priority={priority} />
      </span>
      <span className="hidden dark:inline-flex">
        <BrandLogo variant="white-text" priority={priority} />
      </span>
    </>
  )
}

/** Sharp outlined brand artwork with a light contrast surface for dark UI. */
export function BrandLogo({
  compact = false,
  onDark = false,
  priority = false,
  variant = 'default',
  className = ''
}: BrandLogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${
        onDark
          ? compact
            ? 'h-10 w-10 rounded-xl bg-white p-2 shadow-sm ring-1 ring-primary/20'
            : 'rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-primary/20'
          : ''
      } ${className}`}
    >
      <Image
        src={
          compact
            ? '/logo-icon.svg'
            : variant === 'white-text'
              ? '/sneepcut-logo-white-text.svg'
              : '/sneepcut-logo.svg'
        }
        alt="sneepcut"
        width={compact ? 512 : 1652}
        height={compact ? 512 : 396}
        className={compact ? 'h-6 w-6' : 'h-7 w-auto'}
        priority={priority}
      />
    </span>
  )
}
