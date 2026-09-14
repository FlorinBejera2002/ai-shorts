'use client'

import { cn } from '@/lib/utils'
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform
} from 'framer-motion'
import { type ReactNode, useEffect, useId } from 'react'

const SPRING = {
  type: 'spring',
  stiffness: 200,
  damping: 28,
  mass: 1
} as const
const NECK_BREAK = 0.22
const NECK_HEIGHT = 100

const sizes = {
  xs: { label: 'gap-1 px-2 py-1.5 text-[11px]', radius: 8, separation: 14 },
  sm: { label: 'gap-1.5 px-3.5 py-2 text-xs', radius: 10, separation: 16 }
} as const

type GooeyNavItem = {
  label: string
  icon?: ReactNode
}

type SegmentProps = {
  gap: number
  span: number
  hasSeam: boolean
  leftFill: string
  rightFill: string
  reduced: boolean
  radii: Record<string, number>
  active: boolean
  stretch: boolean
  children: ReactNode
}

function neckPath(gap: number, span: number) {
  if (
    !Number.isFinite(gap) ||
    !Number.isFinite(span) ||
    gap <= 0 ||
    span <= 0
  ) {
    return ''
  }

  const waist = NECK_HEIGHT * (1 - gap / (span * NECK_BREAK))
  if (waist <= 0) return ''
  const start = span - gap
  const middle = start + gap / 2
  return `M${start} 0 Q${middle} ${NECK_HEIGHT - waist} ${span} 0 L${span} ${NECK_HEIGHT} Q${middle} ${waist} ${start} ${NECK_HEIGHT} Z`
}

function GooeySegment({
  gap,
  span,
  hasSeam,
  leftFill,
  rightFill,
  reduced,
  radii,
  active,
  stretch,
  children
}: SegmentProps) {
  const marginLeft = useSpring(gap, SPRING)
  const gradientId = `gooey-neck-${useId().replace(/:/g, '')}`

  useEffect(() => {
    if (reduced) marginLeft.jump(gap)
    else marginLeft.set(gap)
  }, [gap, marginLeft, reduced])

  const path = useTransform(marginLeft, (value) => neckPath(value, span))

  return (
    <motion.li
      className={cn(
        'relative bg-background ring-1 ring-inset ring-border',
        stretch && 'min-w-0 flex-1',
        active &&
          'bg-foreground ring-foreground transition-colors duration-[400ms]'
      )}
      style={{ marginLeft }}
      initial={false}
      animate={radii}
      transition={reduced ? { duration: 0 } : SPRING}
    >
      {hasSeam && (
        <svg
          aria-hidden={true}
          width={span}
          viewBox={`0 0 ${span} ${NECK_HEIGHT}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute right-full top-0 h-full text-background"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1">
              <stop offset="0" stopColor={leftFill} />
              <stop offset="1" stopColor={rightFill} />
            </linearGradient>
          </defs>
          <motion.path d={path} fill={`url(#${gradientId})`} />
        </svg>
      )}
      {children}
    </motion.li>
  )
}

export function GooeyNav({
  items,
  value,
  onChange,
  size = 'sm',
  activeColor = 'var(--foreground)',
  activeLabelColor = 'var(--background)',
  className,
  stretch = false,
  'aria-label': ariaLabel
}: {
  items: GooeyNavItem[]
  value: number
  onChange: (index: number) => void
  size?: keyof typeof sizes
  activeColor?: string
  activeLabelColor?: string
  className?: string
  stretch?: boolean
  'aria-label': string
}) {
  const reduced = useReducedMotion() ?? false
  const span = sizes[size].separation
  const corner = sizes[size].radius
  const open = (seam: number) =>
    seam === 0 || seam === items.length || seam - 1 === value || seam === value
  const fill = (index: number) =>
    index === value ? activeColor : 'var(--background)'

  return (
    <nav
      aria-label={ariaLabel}
      className={cn('inline-block', stretch && 'block w-full', className)}
    >
      <ul className={cn('flex items-center', stretch && 'w-full')}>
        {items.map((item, index) => {
          const active = index === value
          return (
            <GooeySegment
              key={item.label}
              gap={index === 0 ? 0 : open(index) ? span : -1}
              span={span}
              hasSeam={index > 0}
              leftFill={fill(index - 1)}
              rightFill={fill(index)}
              reduced={reduced}
              active={active}
              stretch={stretch}
              radii={{
                borderTopLeftRadius: open(index) ? corner : 0,
                borderBottomLeftRadius: open(index) ? corner : 0,
                borderTopRightRadius: open(index + 1) ? corner : 0,
                borderBottomRightRadius: open(index + 1) ? corner : 0
              }}
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(index)}
                className={cn(
                  'flex cursor-pointer items-center whitespace-nowrap font-medium [&_svg]:shrink-0',
                  stretch && 'w-full justify-center',
                  sizes[size].label,
                  active
                    ? 'transition-colors duration-[400ms]'
                    : 'text-muted-foreground transition-colors duration-0 hover:text-foreground'
                )}
                style={
                  active
                    ? {
                        color: activeLabelColor
                      }
                    : undefined
                }
              >
                {item.icon}
                {item.label}
              </button>
            </GooeySegment>
          )
        })}
      </ul>
    </nav>
  )
}
