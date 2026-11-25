import type * as React from 'react'
import { cn } from '../../lib/utils'

export function Alert({ className, ...props }: React.ComponentProps<'div'>) {
  return <div role="alert" data-slot="alert" className={cn('relative flex gap-3 rounded-md border bg-card p-4 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', className)} {...props} />
}
