import type * as React from 'react'
import { cn } from '../../lib/utils'
export function Table({ className, ...props }: React.ComponentProps<'table'>) { return <div className="relative w-full overflow-auto"><table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} /></div> }
export function TableHeader(props: React.ComponentProps<'thead'>) { return <thead data-slot="table-header" {...props} /> }
export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) { return <tbody data-slot="table-body" className={cn('[&>tr:last-child]:border-b-0', className)} {...props} /> }
export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) { return <tr data-slot="table-row" className={cn('border-b transition-colors hover:bg-muted/60', className)} {...props} /> }
export function TableHead({ className, ...props }: React.ComponentProps<'th'>) { return <th data-slot="table-head" className={cn('h-11 px-4 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground', className)} {...props} /> }
/** Header row from column names; an empty name becomes a screen-reader-only "Acțiuni" column. */
export function TableColumns({ columns }: { columns: string[] }) {
  return <TableHeader><TableRow>{columns.map((column) => <TableHead key={column || 'actions'}>{column || <span className="sr-only">Acțiuni</span>}</TableHead>)}</TableRow></TableHeader>
}
export function TableCell({ className, ...props }: React.ComponentProps<'td'>) { return <td data-slot="table-cell" className={cn('px-4 py-3 align-middle', className)} {...props} /> }
