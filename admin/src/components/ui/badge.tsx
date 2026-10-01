import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../../lib/utils'

const variants = cva('inline-flex w-fit items-center rounded-sm px-2 py-1 text-xs font-semibold', { variants: { variant: { default: 'bg-primary text-primary-foreground', secondary: 'bg-secondary text-secondary-foreground', destructive: 'bg-destructive/12 text-destructive', outline: 'border text-foreground', success: 'bg-success/12 text-success' } }, defaultVariants: { variant: 'default' } })
export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof variants>) { return <span data-slot="badge" className={cn(variants({ variant }), className)} {...props} /> }
