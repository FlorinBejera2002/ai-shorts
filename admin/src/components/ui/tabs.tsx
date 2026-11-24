import { Tabs as Primitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '../../lib/utils'
export function Tabs(props: React.ComponentProps<typeof Primitive.Root>) { return <Primitive.Root data-slot="tabs" {...props} /> }
export function TabsList({ className, ...props }: React.ComponentProps<typeof Primitive.List>) { return <Primitive.List data-slot="tabs-list" className={cn('inline-flex rounded-full border bg-background p-1', className)} {...props} /> }
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Primitive.Trigger>) { return <Primitive.Trigger data-slot="tabs-trigger" className={cn('h-9 rounded-full px-4 text-[13px] font-semibold text-[var(--secondary-text)] outline-none transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=active]:bg-primary data-[state=active]:text-primary-foreground', className)} {...props} /> }
