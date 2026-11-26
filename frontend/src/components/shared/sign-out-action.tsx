'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useToast } from '@/components/ui/toast'
import { authClient } from '@/lib/auth'
import { LogOut, X } from 'lucide-react'
import { pickInlineText } from '@/i18n/inline-text'
import { useLocale, useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function SignOutAction({
  iconOnly = false,
  disabled = false,
  className
}: {
  iconOnly?: boolean
  disabled?: boolean
  className?: string
}) {
  const locale = useLocale()
  const t = useTranslations('common')
  const addToast = useToast((state) => state.add)
  const [open, setOpen] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const label = pickInlineText(locale, 'Sign out', 'Deconectare', 'Cerrar sesión')
  async function signOut() {
    if (pendingRef.current || disabled) return
    pendingRef.current = true
    setPending(true)
    try {
      await authClient.logout()
      setOpen(false)
    } catch {
      addToast('error', t('signOutFailed'))
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  const content = (
    <>
      {pending ? (
        <LoadingIndicator className="size-4" />
      ) : (
        <LogOut className="size-4" aria-hidden="true" />
      )}
      {!iconOnly && label}
    </>
  )
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value)
      }}
    >
      <DialogTrigger asChild={true}>
        <Button
          type="button"
          variant={iconOnly ? 'ghost' : 'outline'}
          size={iconOnly ? 'icon' : 'default'}
          aria-label={label}
          title={iconOnly ? label : undefined}
          className={cn(
            className,
            iconOnly
              ? 'size-8 shrink-0 text-muted-foreground hover:text-destructive'
              : undefined
          )}
          disabled={pending || disabled}
        >
          {content}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-sm gap-5 rounded-md bg-card"
        data-settings-sign-out-dialog=""
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault()
        }}
      >
        <DialogHeader>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            disabled={pending}
            aria-label={pickInlineText(locale, 'Close', 'Închide', 'Cerrar')}
            className="absolute right-3 top-3 text-muted-foreground hover:bg-muted"
          >
            <X aria-hidden="true" />
          </Button>
          <DialogTitle>
            {pickInlineText(locale, 'Sign out?', 'Te deconectezi?', '¿Cerrar sesión?')}
          </DialogTitle>
          <DialogDescription>
            {pickInlineText(
              locale,
              'You’ll need to sign in again to access your workspace.',
              'Va trebui să te autentifici din nou pentru a reveni în cont.',
              'Tendrás que volver a iniciar sesión para acceder a tu espacio de trabajo.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            {pickInlineText(locale, 'Cancel', 'Anulează', 'Cancelar')}
          </Button>
          <Button
            type="button"
            className="bg-foreground text-background hover:bg-foreground/90"
            disabled={pending}
            onClick={() => {
              void signOut()
            }}
          >
            {pending && <LoadingIndicator className="size-4" />}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
