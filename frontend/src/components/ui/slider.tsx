'use client'

import { cn } from '@/lib/utils'
import { Slider as SliderPrimitive } from 'radix-ui'
import type * as React from 'react'

export function Slider({
  className,
  value,
  defaultValue,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const values = value ?? defaultValue ?? [props.min ?? 0]
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      className={cn(
        'relative flex min-h-8 w-full touch-none select-none items-center data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {values.map((_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          aria-label={props['aria-label']}
          className="block size-4 shrink-0 rounded-full border-2 border-primary bg-background shadow-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/30 disabled:pointer-events-none"
        />
      ))}
    </SliderPrimitive.Root>
  )
}
