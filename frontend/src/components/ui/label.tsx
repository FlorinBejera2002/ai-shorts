import { cn } from '@/lib/utils'
import type * as React from 'react'

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'text-sm font-medium leading-relaxed peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}
