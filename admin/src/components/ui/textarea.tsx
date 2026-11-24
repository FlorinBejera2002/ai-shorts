import type * as React from 'react'
import { cn } from '../../lib/utils'
import { fieldClassName } from './input'

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) { return <textarea data-slot="textarea" className={cn('min-h-28 py-3', fieldClassName, className)} {...props} /> }
