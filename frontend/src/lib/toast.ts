import { useToast, type ToastOptions } from '@/components/ui/toast'

/** Shows toasts from code outside React components (stores, request helpers, event handlers). */
export const toast = {
  success: (message: string, options?: ToastOptions) => useToast.getState().add('success', message, options),
  error: (message: string, options?: ToastOptions) => useToast.getState().add('error', message, options),
  warning: (message: string, options?: ToastOptions) => useToast.getState().add('warning', message, options),
  info: (message: string, options?: ToastOptions) => useToast.getState().add('info', message, options),
  dismiss: (id: string) => useToast.getState().dismiss(id)
}
