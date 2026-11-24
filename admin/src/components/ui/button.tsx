import { type VariantProps, cva } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '../../lib/utils'

/* Reference pill buttons: black primary, outlined secondary, never blue. */
const buttonVariants = cva('inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:size-4', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]',
      destructive: 'bg-destructive text-white hover:bg-destructive/90',
      outline: 'bg-transparent text-foreground shadow-[inset_0_0_0_1px_var(--strong-outline)] hover:bg-muted',
      secondary: 'bg-transparent text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-muted',
      ghost: 'text-[var(--secondary-text)] hover:bg-muted hover:text-foreground',
      link: 'underline-offset-4 hover:underline'
    },
    size: { default: 'h-10 px-5', sm: 'h-9 px-4 text-[13px]', lg: 'h-11 px-6', icon: 'size-10' }
  },
  defaultVariants: { variant: 'default', size: 'default' }
})

export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : 'button'
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
