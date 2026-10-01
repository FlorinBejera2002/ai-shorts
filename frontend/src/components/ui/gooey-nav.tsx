'use client'

// Adapted from Rare UI's Gooey Nav: https://www.rareui.com/components/gooeynav
// Vertical segments transpose the seam geometry without rotating their labels.
import { cn } from '@/lib/utils'
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue
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
  disabled?: boolean
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
  vertical: boolean
  children: ReactNode
}

function neckPath(gap: number, span: number, vertical: boolean) {
  if (!Number.isFinite(gap) || !Number.isFinite(span) || gap <= 0 || span <= 0) {
    return ''
  }

  const waist = NECK_HEIGHT * (1 - gap / (span * NECK_BREAK))
  if (waist <= 0) return ''
  const start = span - gap
  const middle = start + gap / 2
  if (vertical) {
    return `M0 ${start} Q${NECK_HEIGHT - waist} ${middle} 0 ${span} L${NECK_HEIGHT} ${span} Q${waist} ${middle} ${NECK_HEIGHT} ${start} Z`
  }
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
  vertical,
  children
}: SegmentProps) {
  const marginLeft = useSpring(gap, SPRING)

  useEffect(() => {
    if (reduced) marginLeft.jump(gap)
    else marginLeft.set(gap)
  }, [gap, marginLeft, reduced])

  return (
    <motion.li
      className={cn(
        'relative',
        vertical ? 'w-full bg-muted' : 'bg-background ring-1 ring-inset ring-border',
        stretch && !vertical && 'min-w-0 flex-1',
        active && 'bg-foreground ring-foreground',
        active && !reduced && 'transition-colors duration-[400ms]'
      )}
      style={{
        marginLeft: vertical ? 0 : marginLeft,
        marginTop: vertical ? marginLeft : 0
      }}
      initial={false}
      animate={radii}
      transition={reduced ? { duration: 0 } : SPRING}
    >
      {hasSeam && (
        <GooeyNeck
          spacing={marginLeft}
          span={span}
          vertical={vertical}
          leftFill={leftFill}
          rightFill={rightFill}
        />
      )}
      {children}
    </motion.li>
  )
}

function GooeyNeck({
  spacing,
  span,
  vertical,
  leftFill,
  rightFill
}: {
  spacing: MotionValue<number>
  span: number
  vertical: boolean
  leftFill: string
  rightFill: string
}) {
  const gradientId = `gooey-neck-${useId().replace(/:/g, '')}`
  const path = useTransform(spacing, (value) => neckPath(value, span, vertical))
  return (
    <svg
      aria-hidden
      width={vertical ? undefined : span}
      height={vertical ? span : undefined}
      viewBox={vertical ? `0 0 ${NECK_HEIGHT} ${span}` : `0 0 ${span} ${NECK_HEIGHT}`}
      preserveAspectRatio="none"
      className={cn(
        'pointer-events-none absolute',
        vertical ? 'bottom-full left-0 w-full' : 'right-full top-0 h-full'
      )}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2={vertical ? '0' : '1'}
          y2={vertical ? '1' : '0'}
        >
          <stop offset="0" stopColor={leftFill} />
          <stop offset="1" stopColor={rightFill} />
        </linearGradient>
      </defs>
      <motion.path d={path} fill={`url(#${gradientId})`} />
    </svg>
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
  orientation = 'horizontal',
  currentStep = false,
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
  orientation?: 'horizontal' | 'vertical'
  currentStep?: boolean
  'aria-label': string
}) {
  const reduced = useReducedMotion() ?? false
  const vertical = orientation === 'vertical'
  const span = sizes[size].separation
  const corner = sizes[size].radius
  const open = (seam: number) =>
    seam === 0 || seam === items.length || seam - 1 === value || seam === value
  const fill = (index: number) =>
    index === value ? activeColor : vertical ? 'var(--muted)' : 'var(--background)'

  return (
    <nav
      aria-label={ariaLabel}
      data-orientation={orientation}
      className={cn('inline-block', stretch && 'block w-full', className)}
    >
      <ul
        className={cn('flex items-center', vertical && 'flex-col', stretch && 'w-full')}
      >
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
              vertical={vertical}
              radii={{
                borderTopLeftRadius: open(index) ? corner : 0,
                borderBottomLeftRadius: open(vertical ? index + 1 : index) ? corner : 0,
                borderTopRightRadius: open(vertical ? index : index + 1) ? corner : 0,
                borderBottomRightRadius: open(index + 1) ? corner : 0
              }}
            >
              <button
                type="button"
                aria-pressed={currentStep ? undefined : active}
                aria-current={currentStep && active ? 'step' : undefined}
                disabled={item.disabled}
                onClick={() => onChange(index)}
                className={cn(
                  'relative flex cursor-pointer items-center whitespace-nowrap font-medium focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-default [&_svg]:shrink-0',
                  stretch && 'w-full',
                  stretch && !vertical && 'justify-center',
                  vertical && 'text-left',
                  sizes[size].label,
                  active
                    ? !reduced && 'transition-colors duration-[400ms]'
                    : 'text-muted-foreground transition-colors duration-0 enabled:hover:bg-muted enabled:hover:text-foreground'
                )}
                style={{
                  borderRadius: 'inherit',
                  ...(active ? { color: activeLabelColor } : {})
                }}
              >
                {item.icon}
                <span className="min-w-0">{item.label}</span>
              </button>
            </GooeySegment>
          )
        })}
      </ul>
    </nav>
  )
}
