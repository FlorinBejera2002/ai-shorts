import { Avatar as Primitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '../../lib/utils'

export function Avatar({ className, ...props }: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="avatar" className={cn('relative flex size-9 shrink-0 overflow-hidden rounded-full', className)} {...props} />
}
export function AvatarFallback({ className, ...props }: React.ComponentProps<typeof Primitive.Fallback>) {
  return <Primitive.Fallback className={cn('flex size-full items-center justify-center rounded-full bg-muted text-sm font-medium', className)} {...props} />
}
