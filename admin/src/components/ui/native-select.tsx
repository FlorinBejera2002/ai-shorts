import type * as React from 'react'
import { cn } from '../../lib/utils'
import { fieldClassName } from './input'

export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) { return <select data-slot="native-select" className={cn('h-11', fieldClassName, className)} {...props} /> }
