'use client'

import { cn } from '@/lib/utils'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type * as React from 'react'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-6 overflow-y-auto rounded-xl border bg-background p-6 text-foreground shadow-xl outline-none',
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
export function DialogHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-left', className)}
      {...props}
    />
  )
}
export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-wrap justify-end gap-2', className)}
      {...props}
    />
  )
}
export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'text-lg font-semibold leading-snug tracking-tight',
        className
      )}
      {...props}
    />
  )
}
export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm leading-6 text-muted-foreground', className)}
      {...props}
    />
  )
}
