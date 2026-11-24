import { X } from 'lucide-react'
import { Dialog as Primitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '../../lib/utils'

export function Sheet(props: React.ComponentProps<typeof Primitive.Root>) { return <Primitive.Root {...props} /> }
export function SheetContent({ className, children, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal>
    <Primitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-[var(--overlay)]" />
    <Primitive.Content data-slot="sheet-content" className={cn('fixed inset-y-0 right-0 z-50 w-full max-w-[480px] overflow-y-auto rounded-l-[var(--dialog-radius)] bg-card p-8 text-foreground shadow-[var(--dialog-shadow)] outline-none max-sm:rounded-none max-sm:p-5', className)} {...props}>
      {children}
      <Primitive.Close data-slot="sheet-close" className="absolute right-6 top-6 inline-flex size-10 items-center justify-center rounded-full text-[var(--secondary-text)] shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label="Închide"><X className="size-4" /></Primitive.Close>
    </Primitive.Content>
  </Primitive.Portal>
}
export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) { return <div className={cn('grid gap-1 pr-12', className)} {...props} /> }
export function SheetTitle({ className, ...props }: React.ComponentProps<typeof Primitive.Title>) { return <Primitive.Title className={cn('text-xl font-semibold tracking-[-0.02em]', className)} {...props} /> }
export function SheetDescription({ className, ...props }: React.ComponentProps<typeof Primitive.Description>) { return <Primitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} /> }
