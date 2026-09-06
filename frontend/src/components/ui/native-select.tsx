import { cn } from '@/lib/utils'
import type * as React from 'react'

/** Native shadcn-style select keeps form submission and mobile OS pickers intact. */
export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className
      )}
      {...props}
    />
  )
}
