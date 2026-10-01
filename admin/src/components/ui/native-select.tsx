import type * as React from 'react'
import { cn } from '../../lib/utils'

export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) { return <select data-slot="native-select" className={cn('h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} {...props} /> }
