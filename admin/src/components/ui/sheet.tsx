import { X } from 'lucide-react'
import { Dialog as Primitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '../../lib/utils'

export function Sheet(props: React.ComponentProps<typeof Primitive.Root>) { return <Primitive.Root {...props} /> }
export function SheetContent({ className, children, ...props }: React.ComponentProps<typeof Primitive.Content>) { return <Primitive.Portal><Primitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-black/35" /><Primitive.Content data-slot="sheet-content" className={cn('fixed inset-y-0 right-0 z-50 w-full max-w-[470px] overflow-y-auto border-l bg-background p-8 shadow-2xl outline-none', className)} {...props}>{children}<Primitive.Close data-slot="sheet-close" className="absolute right-5 top-5 inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-muted" aria-label="Închide"><X className="size-4" /></Primitive.Close></Primitive.Content></Primitive.Portal> }
export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) { return <div className={cn('grid gap-1.5', className)} {...props} /> }
export function SheetTitle({ className, ...props }: React.ComponentProps<typeof Primitive.Title>) { return <Primitive.Title className={cn('text-lg font-semibold', className)} {...props} /> }
export function SheetDescription({ className, ...props }: React.ComponentProps<typeof Primitive.Description>) { return <Primitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} /> }
