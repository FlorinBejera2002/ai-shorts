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
import { useToast } from '@/components/ui/toast'
import { authClient } from '@/lib/auth'
import { Loader2, LogOut } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useRef, useState } from 'react'

export function SignOutAction({ iconOnly = false }: { iconOnly?: boolean }) {
  const locale = useLocale()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState(false)
  const label = locale === 'ro' ? 'Deconectare' : 'Sign out'
  async function signOut() {
    if (pending) return
    setPending(true)
    try {
      await authClient.logout()
      setOpen(false)
    } catch {
      toast.add(
        'error',
        locale === 'ro'
          ? 'Deconectarea a e\u0219uat. \u00cencearc\u0103 din nou.'
          : 'Unable to sign out. Please try again.'
      )
    } finally {
      setPending(false)
    }
  }
  const content = (
    <>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
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
          className={
            iconOnly
              ? 'size-8 shrink-0 text-muted-foreground hover:text-destructive'
              : undefined
          }
          disabled={pending}
        >
          {content}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-sm gap-5 rounded-2xl bg-card"
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
          <DialogTitle>
            {locale === 'ro' ? 'Te deconectezi?' : 'Sign out?'}
          </DialogTitle>
          <DialogDescription>
            {locale === 'ro'
              ? 'Va trebui s\u0103 te autentifici din nou pentru a reveni \u00een cont.'
              : 'You will need to sign in again to access your account.'}
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
            {locale === 'ro' ? 'Anuleaz\u0103' : 'Cancel'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              void signOut()
            }}
          >
            {pending && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
