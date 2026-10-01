import { Progress as Primitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '../../lib/utils'

export function Progress({ className, value = 0, ...props }: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="progress" value={value} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)} {...props}>
    <Primitive.Indicator data-slot="progress-indicator" className="size-full bg-primary transition-transform" style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value ?? 0))}%)` }} />
  </Primitive.Root>
}
