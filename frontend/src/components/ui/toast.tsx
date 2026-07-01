'use client'

import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { create } from 'zustand'

type Toast = {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
}

type ToastStore = {
  toasts: Toast[]
  add: (type: Toast['type'], message: string) => void
  dismiss: (id: string) => void
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  add: (type, message) => {
    const id = Math.random().toString(36).slice(2, 9)
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const colorMap = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
}

const borderMap = {
  success: 'border-l-emerald-500',
  error: 'border-l-red-500',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500',
}

export function Toaster() {
  const toasts = useToast((s) => s.toasts)
  const dismiss = useToast((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-toast-in flex items-center gap-2.5 rounded-lg border border-border border-l-2 ${borderMap[toast.type]} bg-card px-3.5 py-2.5 shadow-lg shadow-black/8 min-w-[260px] max-w-[360px]`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${colorMap[toast.type]}`} />
            <p className="text-[13px] text-card-foreground flex-1 leading-snug">
              {toast.message}
            </p>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
