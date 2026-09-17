import { cn } from '@/lib/utils'
import type * as React from 'react'

export function Textarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-28 w-full rounded-lg border border-input bg-background px-3 py-3 text-base shadow-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className
      )}
      {...props}
    />
  )
}
