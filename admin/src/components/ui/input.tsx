import type * as React from 'react'
import { cn } from '../../lib/utils'

/** Shared look for text inputs, text areas and native selects. */
export const fieldClassName = 'w-full min-w-0 rounded-md border border-input bg-background px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-[var(--border-strong)] focus-visible:border-ring disabled:opacity-50'

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn('h-11', fieldClassName, className)} {...props} />
}
