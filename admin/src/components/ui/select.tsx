import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Select as Primitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '../../lib/utils'
import { fieldClassName } from './input'

export function Select(props: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root {...props} />
}

export function SelectValue(props: React.ComponentProps<typeof Primitive.Value>) {
  return <Primitive.Value {...props} />
}

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger data-slot="select-trigger" className={cn('flex h-11 items-center justify-between gap-2 disabled:cursor-not-allowed [&>span]:truncate', fieldClassName, className)} {...props}>
    {children}<Primitive.Icon asChild><ChevronDown className="size-4 shrink-0 text-muted-foreground" /></Primitive.Icon>
  </Primitive.Trigger>
}

export function SelectContent({ className, children, position = 'popper', ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content data-slot="select-content" position={position} sideOffset={6} className={cn('relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-[var(--menu-shadow)]', className)} {...props}>
    <Primitive.ScrollUpButton className="flex justify-center py-1"><ChevronUp className="size-4" /></Primitive.ScrollUpButton>
    <Primitive.Viewport className="p-1.5">{children}</Primitive.Viewport>
    <Primitive.ScrollDownButton className="flex justify-center py-1"><ChevronDown className="size-4" /></Primitive.ScrollDownButton>
  </Primitive.Content></Primitive.Portal>
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item data-slot="select-item" className={cn('relative flex h-9 w-full cursor-default select-none items-center rounded-sm pr-8 pl-2.5 text-sm outline-none focus:bg-muted focus:text-foreground data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}>
    <Primitive.ItemText>{children}</Primitive.ItemText>
    <span className="absolute right-2.5 flex size-4 items-center justify-center"><Primitive.ItemIndicator><Check className="size-4" /></Primitive.ItemIndicator></span>
  </Primitive.Item>
}
