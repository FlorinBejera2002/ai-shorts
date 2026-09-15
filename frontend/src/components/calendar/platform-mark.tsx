import type { ContentPlatform } from '@/lib/content-calendar'
import { Facebook, Instagram, Linkedin, Music2, X, Youtube } from 'lucide-react'

const platformStyles = {
  tiktok: {
    icon: Music2,
    className: 'bg-foreground text-background'
  },
  instagram: {
    icon: Instagram,
    className:
      'bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285aeb_90%)] text-white'
  },
  facebook: {
    icon: Facebook,
    className: 'bg-blue-600 text-white'
  },
  youtube: {
    icon: Youtube,
    className: 'bg-red-600 text-white'
  },
  linkedin: {
    icon: Linkedin,
    className: 'bg-blue-700 text-white'
  },
  twitter: {
    icon: X,
    className: 'bg-foreground text-background'
  }
} satisfies Record<
  ContentPlatform,
  { icon: typeof Instagram; className: string }
>

export function PlatformMark({
  platform,
  label,
  size = 'small',
  showLabel = false
}: {
  platform: ContentPlatform
  label: string
  size?: 'small' | 'medium'
  showLabel?: boolean
}) {
  const config = platformStyles[platform]
  const Icon = config.icon

  if (showLabel) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-semibold text-foreground">
        <span
          aria-hidden="true"
          className={`inline-flex h-4 w-4 items-center justify-center rounded-[0.3rem] ${config.className}`}
        >
          <Icon className="h-2.5 w-2.5" strokeWidth={2} />
        </span>
        {label}
      </span>
    )
  }

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-md ${
        size === 'medium' ? 'h-7 w-7' : 'h-5 w-5'
      } ${config.className}`}
    >
      <Icon
        className={size === 'medium' ? 'h-3.5 w-3.5' : 'h-3 w-3'}
        strokeWidth={2}
      />
    </span>
  )
}

export function PlatformOptionIcon({
  platform
}: {
  platform: ContentPlatform
}) {
  const config = platformStyles[platform]
  const Icon = config.icon
  return <Icon className="h-4 w-4" strokeWidth={1.9} />
}
