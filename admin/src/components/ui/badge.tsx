import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../../lib/utils'

/* Small outlined status chips; colour only where it carries a state. */
const variants = cva('inline-flex w-fit items-center gap-1.5 rounded-[8px] border px-2 py-0.5 text-xs font-semibold leading-5', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'text-[var(--secondary-text)]',
      destructive: 'border-transparent bg-[var(--destructive-bg)] text-destructive',
      outline: 'text-[var(--secondary-text)]',
      success: 'border-transparent bg-[var(--success-bg)] text-success'
    }
  },
  defaultVariants: { variant: 'default' }
})
export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof variants>) { return <span data-slot="badge" className={cn(variants({ variant }), className)} {...props} /> }
