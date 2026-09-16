import { LoadingIndicator } from '@/components/ui/loading-indicator'

export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[calc(100svh-6rem)] items-center justify-center"
      aria-label={label}
      aria-busy="true"
      role="status"
    >
      <LoadingIndicator className="size-36" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
