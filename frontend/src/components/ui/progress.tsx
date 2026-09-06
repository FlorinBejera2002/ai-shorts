'use client'

import { cn } from '@/lib/utils'
import { Progress as ProgressPrimitive } from 'radix-ui'
import type * as React from 'react'

export function Progress({
  value = 0,
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const percent = Number.isFinite(value)
    ? Math.min(100, Math.max(0, value ?? 0))
    : 0
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={percent}
      max={100}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-muted',
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 rounded-full bg-primary transition-transform motion-reduce:transition-none"
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
