import { Tabs as Primitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '../../lib/utils'
export function Tabs(props: React.ComponentProps<typeof Primitive.Root>) { return <Primitive.Root data-slot="tabs" {...props} /> }
export function TabsList({ className, ...props }: React.ComponentProps<typeof Primitive.List>) { return <Primitive.List data-slot="tabs-list" className={cn('inline-flex rounded-md bg-muted p-1', className)} {...props} /> }
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Primitive.Trigger>) { return <Primitive.Trigger data-slot="tabs-trigger" className={cn('rounded-sm px-3 py-2 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm', className)} {...props} /> }
