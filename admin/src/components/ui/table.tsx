import type * as React from 'react'
import { cn } from '../../lib/utils'
export function Table({ className, ...props }: React.ComponentProps<'table'>) { return <div className="relative w-full overflow-auto"><table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} /></div> }
export function TableHeader(props: React.ComponentProps<'thead'>) { return <thead data-slot="table-header" {...props} /> }
export function TableBody(props: React.ComponentProps<'tbody'>) { return <tbody data-slot="table-body" {...props} /> }
export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) { return <tr data-slot="table-row" className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} /> }
export function TableHead({ className, ...props }: React.ComponentProps<'th'>) { return <th data-slot="table-head" className={cn('h-10 px-2 text-left align-middle text-xs font-medium text-muted-foreground', className)} {...props} /> }
export function TableCell({ className, ...props }: React.ComponentProps<'td'>) { return <td data-slot="table-cell" className={cn('p-2 align-middle', className)} {...props} /> }
