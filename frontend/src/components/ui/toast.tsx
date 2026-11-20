'use client'

import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { create } from 'zustand'

type ToastType = 'success' | 'error' | 'info' | 'warning'

export type ToastAction = { label: string; onClick: () => void }

export type ToastOptions = {
  /** A button inside the toast, such as Retry or Undo. Keeps the toast up longer. */
  action?: ToastAction
  /**
   * An Ana/Radu illustration. Illustrated toasts sit at the bottom centre;
   * every other toast stacks at the top right.
   */
  illustration?: { src: string; alt: string }
}

type Toast = {
  id: string
  type: ToastType
  message: string
  action?: ToastAction
  illustration?: ToastOptions['illustration']
  /** Set while the exit animation plays, before the toast is removed. */
  leaving: boolean
}

type ToastStore = {
  toasts: Toast[]
  /** Shows a toast and returns its id. An identical toast already on screen is reused. */
  add: (type: ToastType, message: string, options?: ToastOptions) => string
  dismiss: (id: string) => void
}

const DURATION_MS: Record<ToastType, number> = { success: 4000, info: 4000, warning: 6000, error: 6000 }
/** Toasts with a button stay long enough to reach it. */
const ACTION_DURATION_MS = 8000
/** Matches the `--motion-toast-out-duration` exit in motion.css. */
const EXIT_MS = 260

function durationOf(type: ToastType, options?: ToastOptions) {
  return options?.action ? ACTION_DURATION_MS : DURATION_MS[type]
}

export const useToast = create<ToastStore>((set, get) => ({
  toasts: [],
  add: (type, message, options) => {
    const same = get().toasts.find(
      (toast) =>
        !toast.leaving &&
        toast.type === type &&
        toast.message === message &&
        toast.illustration?.src === options?.illustration?.src &&
        toast.action?.label === options?.action?.label
    )
    if (same) return same.id
    const id = Math.random().toString(36).slice(2, 9)
    const toast: Toast = { id, type, message, action: options?.action, illustration: options?.illustration, leaving: false }
    set((state) => ({ toasts: [...state.toasts, toast] }))
    setTimeout(() => get().dismiss(id), durationOf(type, options))
    return id
  },
  dismiss: (id) => {
    const toast = get().toasts.find((item) => item.id === id)
    if (!toast || toast.leaving) return
    set((state) => ({ toasts: state.toasts.map((item) => (item.id === id ? { ...item, leaving: true } : item)) }))
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })), EXIT_MS)
  }
}))

const iconMap = { success: CheckCircle, error: AlertCircle, warning: AlertTriangle, info: Info }
const iconColor = { success: 'text-success', error: 'text-destructive', warning: 'text-warning', info: 'text-foreground' }

function ToastAction({ toast: item, onDone }: { toast: Toast; onDone: () => void }) {
  if (!item.action) return null
  const { label, onClick } = item.action
  return (
    <button
      type="button"
      onClick={() => {
        onClick()
        onDone()
      }}
      className="shrink-0 rounded-md px-2 py-1 text-[13px] font-semibold text-foreground underline-offset-4 hover:bg-muted"
    >
      {label}
    </button>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('common')
  return (
    <button
      type="button"
      aria-label={t('close')}
      onClick={onClick}
      className="-m-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <X className="size-3.5" />
    </button>
  )
}

/** A compact notice: icon, message, optional action. */
function CornerToast({ toast: item, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = iconMap[item.type]
  return (
    <div
      role={item.type === 'error' ? 'alert' : 'status'}
      data-toast={item.type}
      className={`pointer-events-auto flex items-center gap-2.5 rounded-md border border-border bg-card px-3.5 py-2.5 shadow-lg shadow-black/8 ${item.leaving ? 'toast-corner-out' : 'toast-corner-in'}`}
    >
      <Icon className={`size-4 shrink-0 ${iconColor[item.type]}`} aria-hidden="true" />
      <p className="flex-1 text-[13px] leading-snug text-card-foreground">{item.message}</p>
      <ToastAction toast={item} onDone={onDismiss} />
      <CloseButton onClick={onDismiss} />
    </div>
  )
}

/** An illustrated notice: the Ana/Radu illustration beside a title and an optional action. */
function IllustratedToast({ toast: item, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role={item.type === 'error' ? 'alert' : 'status'}
      data-toast={item.type}
      data-toast-illustrated=""
      className={`pointer-events-auto flex items-center gap-3.5 rounded-md border border-border bg-card py-2.5 pr-3 pl-3 shadow-xl shadow-black/15 ${item.leaving ? 'toast-rise-out' : 'toast-rise-in'}`}
    >
      {item.illustration && (
        <img src={item.illustration.src} alt={item.illustration.alt} width={72} height={72} className="size-[72px] shrink-0 object-contain" />
      )}
      <p className="flex-1 text-[15px] font-semibold leading-snug text-card-foreground">{item.message}</p>
      <ToastAction toast={item} onDone={onDismiss} />
      <CloseButton onClick={onDismiss} />
    </div>
  )
}

/**
 * Two always-mounted live regions: compact toasts at the top right (below the
 * phone header) and illustrated toasts at the bottom centre (above the phone dock).
 */
export function Toaster() {
  const t = useTranslations('common')
  const toasts = useToast((state) => state.toasts)
  const dismiss = useToast((state) => state.dismiss)
  const corner = toasts.filter((item) => !item.illustration)
  const illustrated = toasts.filter((item) => item.illustration)

  return (
    <>
      <section
        aria-live="polite"
        aria-label={t('notifications')}
        className="pointer-events-none fixed top-[calc(env(safe-area-inset-top)+76px)] right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 sm:top-4"
        data-toast-region="corner"
      >
        {corner.map((item) => (
          <CornerToast key={item.id} toast={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </section>
      <section
        aria-live="polite"
        aria-label={t('notifications')}
        className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+104px)] z-[100] flex flex-col items-center gap-2 sm:bottom-6"
        data-toast-region="illustrated"
      >
        {illustrated.map((item) => (
          <IllustratedToast key={item.id} toast={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </section>
    </>
  )
}
