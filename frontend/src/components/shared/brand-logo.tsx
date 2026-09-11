import Image from 'next/image'

const LOGO_SIZE_CLASSES = {
  xs: 'h-2.5',
  sm: 'h-4',
  md: 'h-7'
} as const

type BrandLogoProps = {
  compact?: boolean
  onDark?: boolean
  priority?: boolean
  size?: keyof typeof LOGO_SIZE_CLASSES
  variant?: 'default' | 'white-text'
  className?: string
}

export function ThemeBrandLogo({
  priority = false,
  size = 'md'
}: Pick<BrandLogoProps, 'priority' | 'size'>) {
  return (
    <>
      <span className="inline-flex dark:hidden">
        <BrandLogo priority={priority} size={size} />
      </span>
      <span className="hidden dark:inline-flex">
        <BrandLogo variant="white-text" priority={priority} size={size} />
      </span>
    </>
  )
}

/** Sharp outlined brand artwork with a light contrast surface for dark UI. */
export function BrandLogo({
  compact = false,
  onDark = false,
  priority = false,
  size = 'md',
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
        className={
          compact ? 'h-6 w-6' : `${LOGO_SIZE_CLASSES[size]} w-auto`
        }
        priority={priority}
      />
    </span>
  )
}
