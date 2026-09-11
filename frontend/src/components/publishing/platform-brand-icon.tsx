import type { PublishingProvider } from '@/lib/publishing'
import { useId } from 'react'

type PlatformBrandIconProps = {
  className?: string
  provider: PublishingProvider
}

export function PlatformBrandIcon({
  className,
  provider
}: PlatformBrandIconProps) {
  const gradientId = useId()

  if (provider === 'instagram') {
    return (
      <svg
        aria-hidden="true"
        className={className}
        data-platform-mark={provider}
        viewBox="0 0 24 24"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="3"
            y1="22"
            x2="21"
            y2="2"
          >
            <stop offset="0" stopColor="#ffdc80" />
            <stop offset="0.32" stopColor="#fcaf45" />
            <stop offset="0.58" stopColor="#f77737" />
            <stop offset="0.78" stopColor="#c13584" />
            <stop offset="1" stopColor="#833ab4" />
          </linearGradient>
        </defs>
        <rect
          width="24"
          height="24"
          rx="6"
          fill={`url(#${gradientId})`}
        />
        <rect
          x="5.3"
          y="5.3"
          width="13.4"
          height="13.4"
          rx="4"
          fill="none"
          stroke="white"
          strokeWidth="1.65"
        />
        <circle
          cx="12"
          cy="12"
          r="3.15"
          fill="none"
          stroke="white"
          strokeWidth="1.65"
        />
        <circle cx="16.55" cy="7.65" r="1.05" fill="white" />
      </svg>
    )
  }

  if (provider === 'facebook') {
    return (
      <svg
        aria-hidden="true"
        className={className}
        data-platform-mark={provider}
        viewBox="0 0 24 24"
      >
        <rect width="24" height="24" rx="6" fill="#1877f2" />
        <path
          fill="white"
          d="M13.55 20.5v-7.75h2.6l.39-3.02h-2.99V7.8c0-.88.24-1.47 1.5-1.47h1.6v-2.7a21.4 21.4 0 0 0-2.33-.12c-2.31 0-3.9 1.41-3.9 4.01v2.21H7.8v3.02h2.62v7.75h3.13Z"
        />
      </svg>
    )
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-platform-mark={provider}
      viewBox="0 0 24 24"
    >
      <rect width="24" height="24" rx="6" fill="#0b0b0f" />
      <path
        fill="#25f4ee"
        d="M14.28 4.1h2.2c.2 1.45 1.07 2.58 2.52 3.04v2.24a6.7 6.7 0 0 1-2.58-.7v5.48a4.92 4.92 0 1 1-4.92-4.92c.3 0 .6.03.88.08v2.3a2.65 2.65 0 1 0 1.9 2.54V4.1Z"
        transform="translate(-.45 .35)"
      />
      <path
        fill="#fe2c55"
        d="M14.28 4.1h2.2c.2 1.45 1.07 2.58 2.52 3.04v2.24a6.7 6.7 0 0 1-2.58-.7v5.48a4.92 4.92 0 1 1-4.92-4.92c.3 0 .6.03.88.08v2.3a2.65 2.65 0 1 0 1.9 2.54V4.1Z"
        transform="translate(.45 -.15)"
      />
      <path
        fill="white"
        d="M14.28 4.1h2.2c.2 1.45 1.07 2.58 2.52 3.04v2.24a6.7 6.7 0 0 1-2.58-.7v5.48a4.92 4.92 0 1 1-4.92-4.92c.3 0 .6.03.88.08v2.3a2.65 2.65 0 1 0 1.9 2.54V4.1Z"
      />
    </svg>
  )
}
