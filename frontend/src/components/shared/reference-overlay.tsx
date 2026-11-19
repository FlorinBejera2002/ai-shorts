'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { KeyboardEvent, ReactNode } from 'react'
import ui from './reference-ui.module.css'

/** Classes every portal of a reference page needs to pick up the scoped tokens. */
export const referenceSurface = `${theme.surface} ${ui.tokens}`

type OverlayProps = {
  open: boolean
  mobile: boolean
  busy?: boolean
  wide?: boolean
  alert?: boolean
  /** False when the overlay has no description text. */
  described?: boolean
  onClose: () => void
  children: ReactNode
}

/** Centered dialog on desktop, bottom sheet on phones; locked while a request runs. */
export function ReferenceOverlay({ open, mobile, busy = false, wide, alert, described = true, onClose, children }: OverlayProps) {
  const change = (next: boolean) => {
    if (!next && !busy) onClose()
  }
  const guard = (event: Event) => {
    if (busy) event.preventDefault()
  }
  const a11y = { role: alert ? 'alertdialog' : 'dialog', ...(described ? {} : { 'aria-describedby': undefined }) }
  if (mobile)
    return (
      <Sheet open={open} onOpenChange={change}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          {...a11y}
          className={`${referenceSurface} ${ui.sheet}`}
          overlayClassName={theme.overlay}
          data-reference-surface=""
          onEscapeKeyDown={guard}
          onPointerDownOutside={guard}
        >
          <span className={ui.grab} aria-hidden="true" />
          {children}
        </SheetContent>
      </Sheet>
    )
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        {...a11y}
        className={`${referenceSurface} ${ui.dialog}`}
        overlayClassName={theme.overlay}
        data-reference-surface=""
        data-wide={wide ? '' : undefined}
        onEscapeKeyDown={guard}
        onPointerDownOutside={guard}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function OverlayTitle({ mobile, children }: { mobile: boolean; children: ReactNode }) {
  const Component = mobile ? SheetTitle : DialogTitle
  return <Component className={ui.dialogTitle}>{children}</Component>
}

export function OverlayDescription({ mobile, children }: { mobile: boolean; children: ReactNode }) {
  const Component = mobile ? SheetDescription : DialogDescription
  return <Component className={ui.dialogText}>{children}</Component>
}

/** Cancel + confirm row; a phone sheet stacks them with the confirm on top. */
export function OverlayActions({
  cancel,
  confirm,
  tone,
  busy,
  disabled,
  submit,
  onCancel,
  onConfirm
}: {
  cancel: string
  confirm: string
  tone: 'primary' | 'danger'
  busy: boolean
  disabled?: boolean
  submit?: boolean
  onCancel: () => void
  onConfirm?: () => void
}) {
  return (
    <div className={ui.actions}>
      <button type="button" className={`${ui.button} ${ui.secondary} ${ui.focus}`} disabled={busy} onClick={onCancel}>
        {cancel}
      </button>
      <button
        type={submit ? 'submit' : 'button'}
        className={`${ui.button} ${tone === 'danger' ? ui.danger : ui.primary} ${ui.focus}`}
        disabled={busy || disabled}
        aria-busy={busy || undefined}
        onClick={onConfirm}
      >
        {confirm}
      </button>
    </div>
  )
}

/** The Ana/Radu illustration every delete confirmation uses. */
export function DeleteIllustration({ alt }: { alt: string }) {
  return <img src="/illustrations/delete.webp" alt={alt} width={150} height={150} />
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('common')
  return (
    <button type="button" className={`${ui.iconButton} ${ui.focus} ${ui.closeButton}`} aria-label={t('close')} onClick={onClick}>
      <X aria-hidden="true" />
    </button>
  )
}

const MENU_ITEMS = '[role^="menuitem"]:not([disabled]):not([aria-disabled="true"])'

/** Moves focus between a sheet menu's items with the arrow keys, Home and End, as a menu promises. */
function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>) {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(MENU_ITEMS))
  if (!items.length) return
  const index = items.indexOf(document.activeElement as HTMLElement)
  const next = {
    ArrowDown: (index + 1) % items.length,
    ArrowUp: (index - 1 + items.length) % items.length,
    Home: 0,
    End: items.length - 1
  }[event.key]
  if (next === undefined) return
  event.preventDefault()
  items[next].focus()
}

/** The item list of a phone action sheet, exposed as a keyboard-operable menu. */
export function SheetMenu({ label, className, children }: { label?: string; className: string; children: ReactNode }) {
  return (
    <div className={className} role="menu" aria-label={label} onKeyDown={moveMenuFocus}>
      {children}
    </div>
  )
}
